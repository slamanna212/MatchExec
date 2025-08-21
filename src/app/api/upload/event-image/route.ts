import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'events');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function sanitizeFilename(filename: string): string {
  // Remove any path traversal attempts and dangerous characters
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .substring(0, 100); // Limit filename length
}

function isValidImageType(buffer: Buffer): boolean {
  // Check file signatures (magic bytes)
  const signatures = {
    jpeg: [0xFF, 0xD8, 0xFF],
    png: [0x89, 0x50, 0x4E, 0x47],
    webp: [0x52, 0x49, 0x46, 0x46],
    gif: [0x47, 0x49, 0x46, 0x38]
  };

  for (const [, signature] of Object.entries(signatures)) {
    if (signature.every((byte, index) => buffer[index] === byte)) {
      return true;
    }
  }

  // Additional check for WEBP (needs WEBP in bytes 8-11)
  if (buffer.length > 12 && 
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('image') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, WebP, and GIF are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Get file buffer and validate content
    const buffer = Buffer.from(await file.arrayBuffer());
    
    if (!isValidImageType(buffer)) {
      return NextResponse.json(
        { error: 'Invalid image file. File content does not match image format.' },
        { status: 400 }
      );
    }

    // Generate secure filename
    const timestamp = Date.now();
    const randomBytes = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.name).toLowerCase();
    const sanitizedOriginalName = sanitizeFilename(path.parse(file.name).name);
    const filename = `${timestamp}_${randomBytes}_${sanitizedOriginalName}${extension}`;

    // Save file
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, buffer);

    // Return the URL path (relative to public directory)
    const imageUrl = `/uploads/events/${filename}`;

    return NextResponse.json({
      success: true,
      imageUrl,
      filename
    });

  } catch (error) {
    console.error('Error uploading event image:', error);
    return NextResponse.json(
      { error: 'Failed to upload image' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageUrl = searchParams.get('imageUrl');

    if (!imageUrl) {
      return NextResponse.json(
        { error: 'No image URL provided' },
        { status: 400 }
      );
    }

    // Validate that the URL is for an event image
    if (!imageUrl.startsWith('/uploads/events/')) {
      return NextResponse.json(
        { error: 'Invalid image URL' },
        { status: 400 }
      );
    }

    // Extract filename and create full path
    const filename = path.basename(imageUrl);
    const filePath = path.join(UPLOAD_DIR, filename);

    // Check if file exists and delete it
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted event image: ${filename}`);
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error('Error deleting event image:', error);
    return NextResponse.json(
      { error: 'Failed to delete image' },
      { status: 500 }
    );
  }
}