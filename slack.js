const fetch = require('isomorphic-fetch');

const sendMessageToSlack = message => {
  return fetch(`${process.env.SLACK_HOOK_URL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: message
  });
};

module.exports = sendMessageToSlack;
