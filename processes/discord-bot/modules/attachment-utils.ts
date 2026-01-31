import fs from 'fs';
import path from 'path';
import { AttachmentBuilder } from 'discord.js';
import { logger } from '../../../src/lib/logger/server';

/**
 * Centralized image attachment utility
 * Handles all file reading and attachment creation with proper error handling
 */

export interface AttachmentResult {
  attachment: AttachmentBuilder;
  attachmentName: string;
}

/**
 * Create a Discord attachment from an image URL
 * @param imageUrl - Relative URL like "/uploads/events/image.png"
 * @param attachmentName - Name for the attachment (e.g., "event_image.png")
 * @returns AttachmentBuilder or undefined if failed
 */
export async function createImageAttachment(
  imageUrl: string | undefined | null,
  attachmentName?: string
): Promise<AttachmentBuilder | undefined> {
  if (!imageUrl || !imageUrl.trim()) {
    return undefined;
  }

  try {
    const imagePath = path.join(process.cwd(), 'public', imageUrl.replace(/^\//, ''));

    if (!fs.existsSync(imagePath)) {
      logger.warning(`⚠️ Image not found: ${imagePath}`);
      return undefined;
    }

    // Read file asynchronously
    const imageBuffer = await fs.promises.readFile(imagePath);

    // Validate buffer
    if (!imageBuffer || imageBuffer.length === 0) {
      logger.error(`❌ Image buffer is empty for ${imagePath}`);
      return undefined;
    }

    // Generate attachment name if not provided
    const finalName = attachmentName || `image.${path.extname(imagePath).slice(1)}`;

    logger.debug(`✅ Created attachment: ${finalName} (${imageBuffer.length} bytes)`);

    return new AttachmentBuilder(imageBuffer, { name: finalName });
  } catch (error) {
    logger.error(`❌ Error creating attachment from ${imageUrl}:`, error);
    return undefined;
  }
}

/**
 * Create a Discord attachment and return both attachment and name
 * Useful when you need to reference the attachment name later
 */
export async function createImageAttachmentWithName(
  imageUrl: string | undefined | null,
  attachmentName?: string
): Promise<AttachmentResult | null> {
  if (!imageUrl || !imageUrl.trim()) {
    return null;
  }

  const finalName = attachmentName || `image.${path.extname(imageUrl).slice(1)}`;
  const attachment = await createImageAttachment(imageUrl, finalName);

  if (!attachment) {
    return null;
  }

  return { attachment, attachmentName: finalName };
}
