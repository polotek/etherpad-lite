var path = require('path');
var fs = require('fs');
var settings = require('./utils/Settings');
var log4js = require('log4js');
var syslogAppender = require('log4js-syslog').appender;

//set loglevel
log4js.setGlobalLogLevel(settings.loglevel);

// Sets up logging directory by reading in the directory path from 
// externally configurable JSON file.
var setupLogging = function(port)
{
  var customPatternLayout = log4js.layouts.patternLayout('%p [%d] %c - %m [pid:' + 
      process.pid + ' port:' + port + ']');

  log4js.clearAppenders();
//  log4js.restoreConsole();
  if(settings.env == 'development') {
    log4js.addAppender(log4js.consoleAppender(customPatternLayout));
  }
  
  if(settings.env != 'development') {
    var config = {
        ident: 'paddie'
        , layout: customPatternLayout
      }
      , appender = syslogAppender(config);

    log4js.addAppender(appender, 'httpLog');
    log4js.addAppender(appender, 'apiLog');
    log4js.addAppender(appender, 'socketioLog');
    log4js.addAppender(appender, 'message');
    log4js.addAppender(appender, 'ueberDB');
    log4js.addAppender(appender, 'security');
    log4js.addAppender(appender, 'runtimeLog');
    log4js.addAppender(appender, 'fatalLog');
  }

  if(settings.logDirectory)
  {
    var logDirectory = settings.logDirectory.trim().length == 0 ? 'logs' : settings.logDirectory;
    
    if(!path.existsSync(logDirectory))
    {
      fs.mkdirSync(logDirectory, 0755, true);
    }

    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/http.log'), customPatternLayout), 'httpLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/http.log'), customPatternLayout), 'apiLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/socketio.log'), customPatternLayout), 'socketioLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/socketio.log'), customPatternLayout), 'message'); 
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/runtime.log'), customPatternLayout), 'ueberDB');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/runtime.log'), customPatternLayout), 'security');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/runtime.log'), customPatternLayout), 'runtimeLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/fatal.log'), customPatternLayout), 'fatalLog');
  }
}

exports.setupLogging = setupLogging;
