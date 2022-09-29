# custodial-balancer
automatically balance a channel with a custodial peer

## setup
```
git clone git@github.com:dannydeezy/custodial-balancer.git
cd custodial-balancer
cp sample-config.json config.json
# edit config.json with your custom values
npm i
```

## run once
```
node index.js
```

## run continously (recommended)
it is recommended to run this as a systemd service.

note you may want to make the following edits to the `deezy-custodial-balancer-example.service ` file:
- change username from `ubuntu` to your user
- make sure `/usr/bin/node` is your the location of your `node` binary (can find this out by doing `which node`)
- update `RestartSec` to your desired interval, which will determine how frequently the script runs

```
sudo cp custodial-balancer-example.service /etc/systemd/system/custodial-balancer.service
sudo systemctl enable custodial-balancer.service
sudo systemctl start
```
to follow the logs:
```
journalctl -fu custodial-balancer -n 100
```
