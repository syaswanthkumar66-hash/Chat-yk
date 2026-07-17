const http = require('http');

http.get('http://localhost:3000/socket.io/?EIO=4&transport=polling', (res) => {
  let data = '';
  res.on('data', d => data += d);
  res.on('end', () => {
    const sid = JSON.parse(data.substring(1)).sid;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/socket.io/?EIO=4&transport=polling&sid=' + sid,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Content-Length': 3
      }
    }, (res2) => {
      console.log('POST Status:', res2.statusCode);
      res2.on('data', d => process.stdout.write(d));
    });
    req.write('40'); // Socket.IO connect packet
    req.end();
  });
});
