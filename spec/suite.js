var fu = require('foounit')
  , pth = require('path');

fu.globalize();
fu.mount('src', pth.join(__dirname, '../node'));
fu.mount('spec', pth.join(__dirname, './'));
fu.mount('ueberDB', pth.join(__dirname, '../node_modules/ueberDB'));

var settings = foounit.require(':src/utils/Settings');
//use the sample pad database
settings.dbType = "dirty";
settings.dbSettings = { "filename" : pth.join(__dirname, "samplePad_dirty.db") };
settings.loglevel = "INFO";

// no logging for tests
var log4js = require('log4js');
log4js.setGlobalLogLevel(settings.loglevel);

var run = function() {
  //fu.require(':spec/ueberDB/cache_spec');
  fu.require(':spec/etherpadLite/PadDiff');
  fu.require(':spec/etherpadLite/contentcollector');
  fu.run();
}
  
//since the db settings are manipulated, we can load the db module
var db = foounit.require(':src/db/DB'); 

//init database
var padLoaded = false;
db.init(function(err){
  if(err) throw err;

  run();
});
