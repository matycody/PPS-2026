const express = require('express');
const sharp = require('sharp');
const supabaseAdmin = require('../lib/supabaseAdmin');

const PHOTOS_BUCKET = 'photos'; // privado: URL firmadas solo para cuentas con sesión
const LOGOS_BUCKET = 'team-logos'; // público: escudos y logos
const SIGNED_TTL = 60 * 60; // 1 hora
const ALLOWED = ['jpeg', 'png', 'webp'];

const rawImage = express.raw({
  type: ['image/jpeg', 'image/png', 'image/webp'],
  limit: '5mb',
});

// El cuerpo de la request ES la imagen (con su Content-Type)
function imageBody(req, res, next) {
  rawImage(req, res, (err) => {
    if (err) {
      return res
        .status(err.status === 413 ? 413 : 400)
        .json({ error: 'Imagen inválida o mayor a 5 MB' });
    }
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(400).json({
        error: 'Enviá la imagen (JPG, PNG o WebP, máx. 5 MB) como cuerpo, con su Content-Type',
      });
    }
    next();
  });
}

let ready = false;
async function ensureBuckets() {
  if (ready) return;
  for (const [name, isPublic] of [[PHOTOS_BUCKET, false], [LOGOS_BUCKET, true]]) {
    const { error } = await supabaseAdmin.storage.createBucket(name, { public: isPublic });
    const exists = error && (String(error.statusCode) === '409' || /already exists|duplicate/i.test(error.message));
    if (error && !exists) throw error;
  }
  ready = true;
}

// Valida que sea una imagen real (JPG/PNG/WebP), la orienta, redimensiona y pasa a WebP
async function processImage(buffer, kind) {
  let meta;
  try {
    meta = await sharp(buffer).metadata();
  } catch (err) {
    throw new Error('INVALID_IMAGE');
  }
  if (!ALLOWED.includes(meta.format)) throw new Error('INVALID_IMAGE');

  const img = sharp(buffer).rotate();
  if (kind === 'photo') img.resize(512, 512, { fit: 'cover' });
  else img.resize(512, 512, { fit: 'inside', withoutEnlargement: true });
  return img.webp({ quality: 80 }).toBuffer();
}

async function uploadPhoto(path, buffer) {
  await ensureBuckets();
  const { error } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .upload(path, buffer, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
}

async function uploadLogo(path, buffer) {
  await ensureBuckets();
  const { error } = await supabaseAdmin.storage
    .from(LOGOS_BUCKET)
    .upload(path, buffer, { contentType: 'image/webp', upsert: true });
  if (error) throw error;
  const { data } = supabaseAdmin.storage.from(LOGOS_BUCKET).getPublicUrl(path);
  return data.publicUrl + '?v=' + Date.now();
}

async function removeFile(bucket, path) {
  const { error } = await supabaseAdmin.storage.from(bucket).remove([path]);
  if (error) throw error;
}

async function signedUrl(path) {
  const { data, error } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_TTL);
  return error ? null : data.signedUrl;
}

async function signedUrls(paths) {
  if (!paths.length) return [];
  const { data, error } = await supabaseAdmin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrls(paths, SIGNED_TTL);
  return error ? [] : data;
}

module.exports = {
  PHOTOS_BUCKET,
  LOGOS_BUCKET,
  imageBody,
  processImage,
  uploadPhoto,
  uploadLogo,
  removeFile,
  signedUrl,
  signedUrls,
};
