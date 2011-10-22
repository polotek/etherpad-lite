/**
 * This module is started with bin/run.sh. It sets up a Express HTTP and a Socket.IO Server.
 * Static file Requests are answered directly from this module, Socket.IO messages are passed
 * to MessageHandler and minfied requests are passed to minified.
 */

/*
 * 2011 Peter 'Pita' Martischka (Primary Technology Ltd)
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var nopt = require('nopt');
var log4js = require('log4js');
var os = require("os");
var socketio = require('socket.io');
var fs = require('node-fs');
var settings = require('./utils/Settings');
var db = require('./db/DB');
var async = require('async');
var express = require('express');
var path = require('path');
var minify = require('./utils/Minify');
var formidable = require('formidable');
var apiHandler;
var exportHandler;
var importHandler;
var exporthtml;
var readOnlyManager;
var padManager;
var securityManager;
var socketIORouter;

var argv = nopt({
    'port':Number
    , 'environment':['staging', 'production']
  }
  , {
    'p': ['--port']
    , 'e': ['--environment']
}, process.argv);

//set loglevel
log4js.setGlobalLogLevel(settings.loglevel);
var port = argv.port || settings.port;
settings.env = argv.environment || settings.env;
var customPatternLayout = log4js.layouts.patternLayout('%r %p %c - %m port:' + port);

var logDirectory = '';
var archiveDirectory = '';

var updateLogDirectories = function()
{
  try
  {
    logDirectory = settings.logDirectory.trim().length == 0 ? 'logs' : settings.logDirectory;
    archiveDirectory = settings.archiveDirectory.trim().length == 0 ? 'logs/archives' : settings.archiveDirectory;
  }
  catch(e)
  {
    log4js.clearAppenders();
    log4js.addAppender(log4js.consoleAppender());
    console.log('Error updating log directory from settings.json. Pushing logs to console');
    logDirectory = 'logs';
    archiveDirectory = 'logs/archives';
  }
}

// Sets up logging directory by reading in the directory path from 
// externally configurable JSON file.
var setupLogging = function()
{ 
  updateLogDirectories();
  
  if(!path.existsSync(logDirectory))
  {
    fs.mkdirSync(logDirectory, 0755, true);
  }
  if(!path.existsSync(archiveDirectory))
  {
    fs.mkdirSync(archiveDirectory, 0755, true);
  }

  log4js.clearAppenders();
  log4js.addAppender(log4js.consoleAppender(customPatternLayout));
  if(settings.logDirectory)
  {
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/http.log'), customPatternLayout), 'httpLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/http.log'), customPatternLayout), 'apiLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/socketio.log'), customPatternLayout), 'socketioLog');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/socketio.log'), customPatternLayout), 'message'); 
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/runtime.log'), customPatternLayout), 'ueberDB');
    log4js.addAppender(log4js.fileAppender(path.normalize(logDirectory + '/runtime.log'), customPatternLayout), 'security');
  }
}

try
{
  setupLogging();
}
catch (e)
{
  log4js.clearAppenders();
  log4js.addAppender(log4js.consoleAppender(customPatternLayout));
}

var runtimeLog = log4js.getLogger('runtimeLog');

/*
//try to get the git version
var version = "";
try
{
  var ref = fs.readFileSync(path.join(__dirname, "../.git/HEAD"), "utf-8");
  var refPath = path.join(__dirname, "../.git/") + ref.substring(5, ref.indexOf("\n"));
  version = fs.readFileSync(refPath, "utf-8");
  version = version.substring(0, 7);
  runtimeLog.info("Your Etherpad Lite git version is " + version);
}
catch(e)
{
  runtimeLog.warn("Can't get git version for server header\n" + e.message)
}
*/

var serverName = "Paddie";

//cache 6 hours
exports.maxAge = 1000*60*60*6;

async.waterfall([
  //initalize the database
  function (callback)
  {
    db.init(callback);
  },
  //initalize the http server
  function (callback)
  {
    //create server
    var app = express.createServer();

    //load modules that needs a initalized db
    readOnlyManager = require("./db/ReadOnlyManager");
    exporthtml = require("./utils/ExportHtml");
    exportHandler = require('./handler/ExportHandler');
    importHandler = require('./handler/ImportHandler');
    apiHandler = require('./handler/APIHandler');
    padManager = require('./db/PadManager');
    securityManager = require('./db/SecurityManager');
    socketIORouter = require("./handler/SocketIORouter");

    //install logging
    var httpLogger = log4js.getLogger("httpLog");
    
    app.configure(function()
    {
      //app.use(log4js.connectLogger(httpLogger, { level: log4js.levels.INFO, format: ':status, :method :url'}));
      app.use(log4js.connectLogger(httpLogger));
      app.use(express.cookieParser());
    });

    function bustCache(res) {
      var headers = {};
      headers['Cache-Control'] = 'max-age=-1, must-revalidate, no-cache, no-store';
      headers['Expires'] = new Date(0).toString();
      headers['Last-Modified'] = new Date().toString();
      headers['ETag'] = new Date().getTime().toString() + Math.random();
      for(var h in headers) { res.setHeader(h, headers[h]); }
    }

    //serve static files
    app.get('/static/*', function(req, res)
    {
      res.header("Server", serverName);
      bustCache(res);

      var filePath = path.normalize(__dirname + "/.." +
                                    req.url.replace(/\.\./g, '').split("?")[0]);
      res.sendfile(filePath, { maxAge: exports.maxAge });
    });

    //serve minified files
    app.get('/minified/:id', function(req, res, next)
    {
      res.header("Server", serverName);
      bustCache(res);

      var id = req.params.id;

      if(id == "pad.js" || id == "timeslider.js")
      {
        minify.minifyJS(req,res,id);
      }
      else
      {
        next();
      }
    });

    var code = ''
    , response ='';
    
    if(settings.dbType !== 'dirty') {
    function databaseCheck() {
      try
      {
        // DB call.
        db.db.db.wrappedDB.db.query('SELECT 1', function(error, result) {
          if(error)
          {
            code = 500;
            response = error;
          }
          else
          {
            code = 200;
            response = 'Database health: OK'
          }
        });
      }
      catch(e)
      {
        // If we ever have problem with one of the DB objects being udefined
        // we hit this code and send back a 500 with the trace.
        code = 500;
        response = "Exception performing DB query check: " + e.message;
      }
      runtimeLog.info(response);
    }

    databaseCheck();

    // Ping database every 30 seconds and update code and response values.
    setInterval( function() { 
      databaseCheck();
      }, 30000);
    }

    //api for database health check.
    app.get('/int/healthcheck', function(req,res) {
      res.header('Cache-Control', 'max_age=-1, must-revalidate, no-cache, no-store');
      res.header('ETag', new Date().getTime().toString() + Math.random());
      res.send( response, code);
      return;
    });

    //checks for padAccess
    function hasPadAccess(req, res, callback)
    {
      securityManager.checkAccess(req.params.pad, req.cookies.sessionid, req.cookies.token, undefined, req.cookies.password, undefined, function(err, accessObj)
      {
        if(err) throw err;

        //there is access, continue
        if(accessObj.accessStatus == "grant")
        {
          callback();
        }
        //no access
        else
        {
          res.send("403 - Can't touch this", 403);
        }
      });
    }

    //serve read only pad
    if(settings.env === 'development') {
      app.get('/ro/:id', function(req, res)
      {
        res.header("Server", serverName);

        var html;
        var padId;
        var pad;

        async.series([
          //translate the read only pad to a padId
          function(callback)
          {
            readOnlyManager.getPadId(req.params.id, function(err, _padId)
            {
              padId = _padId;

              //we need that to tell hasPadAcess about the pad
              req.params.pad = padId;

              callback(err);
            });
          },
          //render the html document
          function(callback)
          {
            //return if the there is no padId
            if(padId == null)
            {
              callback("notfound");
              return;
            }

            hasPadAccess(req, res, function()
            {
              //render the html document
              exporthtml.getPadHTMLDocument(padId, null, false, function(err, _html)
              {
                html = _html;
                callback(err);
              });
            });
          }
        ], function(err)
        {
          //throw any unexpected error
          if(err && err != "notfound")
            throw err;

          if(err == "notfound")
            res.send('404 - Not Found', 404);
          else
            res.send(html);
        });
      });

      //serve pad.html under /p
      app.get('/p/:pad', function(req, res, next)
      {
        //ensure the padname is valid and the url doesn't end with a /
        if(!padManager.isValidPadId(req.params.pad) || /\/$/.test(req.url))
        {
          res.send('Such a padname is forbidden', 404);
          return;
        }

        res.header("Server", serverName);
        var filePath = path.normalize(__dirname + "/../static/pad.html");
        res.sendfile(filePath, { maxAge: exports.maxAge });
      });

      //serve timeslider.html under /p/$padname/timeslider
      app.get('/p/:pad/timeslider', function(req, res, next)
      {
        //ensure the padname is valid and the url doesn't end with a /
        if(!padManager.isValidPadId(req.params.pad) || /\/$/.test(req.url))
        {
          res.send('Such a padname is forbidden', 404);
          return;
        }

        res.header("Server", serverName);
        var filePath = path.normalize(__dirname + "/../static/timeslider.html");
        res.sendfile(filePath, { maxAge: exports.maxAge });
      });

      //serve timeslider.html under /p/$padname/timeslider
      app.get('/p/:pad/export/:type', function(req, res, next)
      {
        //ensure the padname is valid and the url doesn't end with a /
        if(!padManager.isValidPadId(req.params.pad) || /\/$/.test(req.url))
        {
          res.send('Such a padname is forbidden', 404);
          return;
        }

        var types = ["pdf", "doc", "txt", "html", "odt"];
        //send a 404 if we don't support this filetype
        if(types.indexOf(req.params.type) == -1)
        {
          next();
          return;
        }

        //if abiword is disabled, and this is a format we only support with abiword, output a message
        if(settings.abiword == null && req.params.type != "html" && req.params.type != "txt" )
        {
          res.send("Abiword is not enabled at this Etherpad Lite instance. Set the path to Abiword in settings.json to enable this feature");
          return;
        }

        res.header("Access-Control-Allow-Origin", "*");
        res.header("Server", serverName);

        hasPadAccess(req, res, function()
        {
          exportHandler.doExport(req, res, req.params.pad, req.params.type);
        });
      });

      //handle import requests
      app.post('/p/:pad/import', function(req, res, next)
      {
        //ensure the padname is valid and the url doesn't end with a /
        if(!padManager.isValidPadId(req.params.pad) || /\/$/.test(req.url))
        {
          res.send('Such a padname is forbidden', 404);
          return;
        }

        //if abiword is disabled, skip handling this request
        if(settings.abiword == null)
        {
          next();
          return;
        }

        res.header("Server", serverName);

        hasPadAccess(req, res, function()
        {
          importHandler.doImport(req, res, req.params.pad);
        });
      });

      //serve index.html under /
      app.get('/', function(req, res)
      {
        res.header("Server", serverName);
        var filePath = path.normalize(__dirname + "/../static/index.html");
        res.sendfile(filePath, { maxAge: exports.maxAge });
      });

      //serve robots.txt
      app.get('/robots.txt', function(req, res)
      {
        res.header("Server", serverName);
        var filePath = path.normalize(__dirname + "/../static/robots.txt");
        res.sendfile(filePath, { maxAge: exports.maxAge });
      });

      //serve favicon.ico
      app.get('/favicon.ico', function(req, res)
      {
        res.header("Server", serverName);
        var filePath = path.normalize(__dirname + "/../static/custom/favicon.ico");
        res.sendfile(filePath, { maxAge: exports.maxAge }, function(err)
        {
          //there is no custom favicon, send the default favicon
          if(err)
          {
            filePath = path.normalize(__dirname + "/../static/favicon.ico");
            res.sendfile(filePath, { maxAge: exports.maxAge });
          }
        });
      });
    }

    var apiLogger = log4js.getLogger("apiLog");

    //api middleware validates http verbs and api endpoints
    function apiMiddleware(req, res, next){
      var func = req.params.func;

      res.header("Server", serverName);
      res.header("Content-Type", "application/json; charset=utf-8");

      //wrap the send function so we can log the response
      res._send = res.send;
      res.send = function(response)
      {
        response = JSON.stringify(response);
        apiLogger.info("RESPONSE, " + req.params.func + ", " + response);

        //is this a jsonp call, if yes, add the function call
        if(req.query.jsonp)
          response = req.query.jsonp + "(" + response + ")";

        res._send.apply(res, arguments);
      }

      if(!apiHandler.isValidRequest(req, func)) {
        // this api method doesn't respond to this verb
        return res.send({code: 1, message: "Function does not respond to " + req.method, data: null});
      } else {
        next();
      }
    }

    //This is a api call, collect all post informations and pass it to the apiHandler
    app.all('/api/1/:func', apiMiddleware, function(req, res)
    {
      apiLogger.info("REQUEST, " + req.params.func + ", " + JSON.stringify(req.query));

      //call the api handler
      apiHandler.handle(req.params.func, req.query, req, res);
    });

    //The Etherpad client side sends information about how a disconnect happen
    app.post('/ep/pad/connection-diagnostic-info', function(req, res)
    {
      new formidable.IncomingForm().parse(req, function(err, fields, files)
      {
        runtimeLog.debug("DIAGNOSTIC-INFO: " + fields.diagnosticInfo);
        res.end("OK");
      });
    });

    //The Etherpad client side sends information about client side javscript errors
    app.post('/jserror', function(req, res)
    {
      new formidable.IncomingForm().parse(req, function(err, fields, files)
      {
        runtimeLog.error("CLIENT SIDE JAVASCRIPT ERROR: " + fields.errorInfo);
        res.end("OK");
      });
    });

    //let the server listen
    app.listen(port, settings.ip);
    runtimeLog.info("Server is listening at " + settings.ip + ":" + port);

    var onShutdown = false;
    var shutdownCalled = false;
    var gracefulShutdown = function(err)
    {
      // stop accepting connections NOW!
      app.pause()

      if(err && err.stack)
      {
        runtimeLog.error(err.stack);
      }
      else if(err)
      {
        runtimeLog.error(err);
      }

      // If we already tried to run shutdown and get another signal hard kill our pid
      if (shutdownCalled) {
        runtimeLog.error('hard kill')
        return process.kill(process.pid, 'SIGKILL')
      }
      shutdownCalled = true;

      //ensure there is only one graceful shutdown running
      if(onShutdown) return;
      onShutdown = true;

      runtimeLog.info("graceful shutdown...");

      //stop the http server
      app.close();

      //do the db shutdown
      if (db && db.db && db.db.doShutdown) {
        db.db.doShutdown(function()
        {
          runtimeLog.info("db sucessfully closed.");
          process.exit();
        });
      } else {
        runtimeLog.info('no db shutdown.')
        process.exit();
      }

      setTimeout(function(){
        runtimeLog.error('shutdown timeout')
        process.exit(1);
      }, 3000);
    }

    //connect graceful shutdown with sigint and uncaughtexception
    if(os.type().indexOf("Windows") == -1)
    {
      //sigint is so far not working on windows
      //https://github.com/joyent/node/issues/1553
      process.on('SIGINT', gracefulShutdown);
    }

    /**
      * This function rotates logs by moving the current logs to the "archives/".
      * When moving to archives, it renames the log file by appending timestamp to it.
      * Eg: http.log_9_14_2011-23_17_3_763
      * It then reloads log4j's appenders by forcing them to create new log files.  
      */
    function rotateLogs()
    {
      var date = new Date()
      , newFileTimeStamp = date.getMonth()+'_'+date.getDate()+'_'+date.getFullYear()+'-'+date.getUTCHours()+
        '_'+date.getUTCMinutes()+'_'+date.getUTCSeconds()+'_'+date.getUTCMilliseconds();
      
      fs.readdirSync(logDirectory).forEach(function(fileName) {
        var filePath = path.normalize(logDirectory + '/' + fileName);
        if( !fs.statSync(filePath).isDirectory())
        {
          fs.renameSync(filePath, path.normalize(archiveDirectory + '/' + fileName + '_' + newFileTimeStamp));
        }
      });
      setupLogging();
    }

    // On SIGHUP, we will rotate logs.
    process.on('SIGHUP', rotateLogs);
    process.on('SIGTERM', gracefulShutdown);

    process.on('uncaughtException', function(err) {
      try {
        runtimeLog.error('Fatal: ', err.message || 'Unknown error');
        if(err.stack) {
          var stack = err.stack.split('\n');
          for(var i = 0; i < stack.length; i++) {
            runtimeLog.error(stack[i]);
          }
        }
      } catch(e) {}
      gracefulShutdown();
    });

    //init socket.io and redirect all requests to the MessageHandler
    var io = socketio.listen(app);
    io.set('transports', ['xhr-polling', 'flashsocket', 'htmlfile', 'jsonp-polling']);
    io.set('flash policy port', parseInt(port,10) + 100);

    var socketIOLogger = log4js.getLogger("socketioLog");
    io.set('logger', {
      debug: function (str)
      {
        socketIOLogger.debug(str);
      },
      info: function (str)
      {
        socketIOLogger.info(str);
      },
      warn: function (str)
      {
        socketIOLogger.warn(str);
      },
      error: function (str)
      {
        socketIOLogger.error(str);
      },
    });


    //minify socket.io javascript
    if(settings.minify)
      io.enable('browser client minification');

    var padMessageHandler = require("./handler/PadMessageHandler");
    var timesliderMessageHandler = require("./handler/TimesliderMessageHandler");

    //Initalize the Socket.IO Router
    socketIORouter.setSocketIO(io);
    socketIORouter.addComponent("pad", padMessageHandler);
    socketIORouter.addComponent("timeslider", timesliderMessageHandler);

    console.log('pid: ',process.pid);
    callback(null);
  }
]);
