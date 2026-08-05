'use strict';

const serverless = require('serverless-http');
const app = require('../server/index');

module.exports = serverless(app, {
  binary: [
    'image/*',
    'application/pdf',
    'application/octet-stream',
    'application/zip',
    'application/msword',
    'application/vnd.*'
  ]
});
