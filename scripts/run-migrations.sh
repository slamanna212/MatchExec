#!/bin/bash

echo "Running database migrations and seeding..."

cd /app
node dist/migrate.js

echo "Database initialization completed"
