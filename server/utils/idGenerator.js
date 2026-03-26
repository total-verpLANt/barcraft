'use strict';

const { nanoid } = require('nanoid');

function generateId(prefix) {
  return `${prefix}_${nanoid(6)}`;
}

module.exports = { generateId };
