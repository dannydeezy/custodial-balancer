const { getChannels, pay } = require('ln-service')
const { requestInvoice, requestPayServiceParams } = require('lnurl-pay')
const config = require('./config.json')
const { lnd } = require('./lnd')
const PATHFINDING_TIMEOUT_MS = config.PATHFINDING_TIMEOUT_MS || 60 * 1000 // 1 minute

async function tryPayInvoice({ invoice, paymentAmountSats, maxRouteFeeSats, outChannelIds }) {
    console.log(`Using max route fee sats ${maxRouteFeeSats}`)

    // Sometimes LND hangs too long when trying to pay, and we need to kill the process.
    function abortMission() {
        console.error("Payment timeout exceeded without terminating. Exiting!")
        process.exit(1)
    }

    const paymentTimeout = setTimeout(abortMission, PATHFINDING_TIMEOUT_MS * 2)
    const paymentResult = await pay(
        {
            lnd,
            request: invoice,
            outgoing_channels: outChannelIds,
            max_fee: maxRouteFeeSats,
            pathfinding_timeout: PATHFINDING_TIMEOUT_MS,
        }
    ).catch(err => {
        console.error(err)
        console.log(`Failed to pay invoice ${invoice}`)
        return null
    })
    clearTimeout(paymentTimeout)

    if (!paymentResult || !paymentResult.confirmed_at) return

    const feePpm = Math.round(paymentResult.safe_fee * 1000000 / paymentAmountSats)
    console.log(`Payment confirmed, with fee ${paymentResult.safe_fee} satoshis, and ppm ${feePpm}`)
}

async function handleChannelBalancing({ channel }) {
    const currentLocalRatio = channel.local_balance * 1.0 / channel.capacity
    const maxLocalBalance = Math.round(config.MAX_LOCAL_BALANCE_RATIO * channel.capacity)
    if (currentLocalRatio <= maxLocalBalance) {
        console.log(`Channel is under max local balance. Not doing anything.`)
        return
    }
    console.log(`Channel local balance is ${channel.local_balance} sats, which is above max local balance ${maxLocalBalance}`)
    const targetPaymentAmountSats = channel.local_balance - maxLocalBalance
    console.log(`Target payment amount is is ${targetPaymentAmountSats}`)

    console.log(`Getting pay service params for ${config.PEER_CUSTODIAL_LNURL}`)
    const payServiceParams = await requestPayServiceParams({
        lnUrlOrAddress: config.PEER_CUSTODIAL_LNURL,
    }).catch(err => {
        console.error(err)
        return null
    })
    if (!payServiceParams) return

    console.log(`Min sendable is ${payServiceParams.min}, Max sendable is ${payServiceParams.max}`)
    const paymentAmountSats = Math.min(Math.max(payServiceParams.min, targetPaymentAmountSats), payServiceParams.max)

    console.log(`Will attempt to send ${paymentAmountSats} to peer's custodial wallet`)
    console.log(`Fetching invoice from ${lnUrlOrAddress} for ${paymentAmountSats} sats`)
    const { invoice } =
        await requestInvoice({
            lnUrlOrAddress: config.PEER_CUSTODIAL_LNURL,
            tokens: paymentAmountSats // satoshis
        }).catch(err => {
            console.error(err)
            return { invoice: null }
        })
    console.log(`Got invoice and will attempt to pay: ${invoice}`)
    await tryPayInvoice({
        invoice,
        paymentAmountSats,
        maxRouteFeeSats: 0,
        outChannelIds: [channel.id]
    })
}

async function run() {
    console.log(`Fetching channels info`)
    const { channels } = await getChannels({
        lnd,
        partner_public_key: config.PEER_PUBKEY
    }).catch(err => {
        console.error(err)
        return {}
    })
    if (!channels) return

    for (const channel of channels) {
        await handleChannelBalancing({ channel })
    }
}

run()