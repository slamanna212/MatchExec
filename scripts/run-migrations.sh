#!/bin/bash

echo "Running database migrations and seeding..."

cd /app
node dist/migrator.js

echo "Database initialization completed"
