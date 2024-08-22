#!/bin/bash
export NODE_EXTRA_CA_CERTS='./certs/budget.crt'
export NODE_NO_WARNINGS=1

node --env-file=.env --experimental-sqlite import.js