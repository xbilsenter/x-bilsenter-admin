'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { runMailSyncCron } = require('../server/cron-mail-sync');

module.exports = function mailSyncCronHandler(req, res) {
  return runMailSyncCron(req, res);
};
