var fs = require('fs')
	, express = require('express')
	, socketio = require('socket.io');

var secureApp = express.createServer({
		key: fs.readFileSync("/usr/local/etc/ssl/yamdev.key")
		, cert: fs.readFileSync("/usr/local/etc/ssl/yamdev.crt")
	})
	, app = express.createServer();

function bustCache(res) {
  var headers = {};
  headers['Cache-Control'] = 'max-age=-1, must-revalidate';
  headers['Expires'] = new Date(0).toString();
  headers['Last-Modified'] = new Date().toString();
  headers['ETag'] = new Date().getTime().toString() + Math.random();
  for(var h in headers) { res.setHeader(h, headers[h]); }
}

secureApp.get('/', mainPage);
secureApp.listen(9002);

//app.use(mainPage);
//app.listen(9001);

var io = socketio.listen(secureApp);
io.set('transports', ['xhr-polling', 'jsonp-polling']);
io.sockets.on('connection', function (socket) {
  if(io.transports && io.transports[socket.id]) {
    console.warn('socket.io transport type ',
        io.transports[socket.id].name);
  }
  socket.on('message', function (data) {
    console.log('from client ', data);
    socket.send('bar');
  });
});


function mainPage(req, res) {
	bustCache(res);
	res.setHeader('content-type', 'text/html')
	res.send( fs.readFileSync('./socketio_test.html') );
}
