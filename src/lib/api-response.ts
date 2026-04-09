import { NextResponse } from 'next/server';

export function apiError(message: string, status = 500) {
  return NextResponse.json({ error: message }, { status });
}

export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
