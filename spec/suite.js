var fu = require('foounit')
  , pth = require('path');

fu.globalize();
fu.mount('src', pth.join(__dirname, '../node'));
fu.mount('spec', pth.join(__dirname, './'));
fu.mount('ueberDB', pth.join(__dirname, '../node_modules/ueberDB'));

//reduce log4js loglevel
var log4js = require("log4js");
log4js.setGlobalLogLevel("INFO");

//fu.require(':spec/ueberDB/cache_spec');
fu.require(':spec/etherpadLite/PadDiff');
fu.run();
