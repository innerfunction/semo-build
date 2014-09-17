#!/bin/bash
rm -Rf output/*
node$2 $1 input output
find output
