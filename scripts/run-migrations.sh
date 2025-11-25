#!/bin/bash

echo "Running database migrations and seeding..."

cd /app
tsx scripts/migrate-background.ts

echo "Database initialization completed"
