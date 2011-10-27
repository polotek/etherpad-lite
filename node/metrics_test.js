var metrics = require('./metrics');

var t = metrics.timer('message.CLIENT_READY')
  , now = new Date();

setTimeout(function (){
  t.update((new Date()) - now);
}, 5000);
