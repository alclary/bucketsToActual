#!/bin/bash
export NODE_TLS_REJECT_UNAUTHORIZED=0
export NODE_NO_WARNINGS=1

node --env-file=.env --experimental-sqlite import.js