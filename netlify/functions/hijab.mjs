// Netlify serverless function: sends a user-approved image to OpenAI image editing.
// Set OPENAI_API_KEY in Netlify site environment variables; never put it in browser code.
export default async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'استخدمي طلب POST.' }, { status: 405 });
  if (!process.env.OPENAI_API_KEY) return Response.json({ error: 'لم يُضبط مفتاح خدمة الصور بعد في إعدادات Netlify.' }, { status: 503 });
  let body;
  try { body = await request.json(); } catch { return Response.json({ error: 'تعذر قراءة الطلب.' }, { status: 400 }); }
  if (body?.consent !== true) return Response.json({ error: 'يلزم الموافقة قبل معالجة الصورة.' }, { status: 400 });
  const match = typeof body.image === 'string' && body.image.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return Response.json({ error: 'صيغة الصورة غير مدعومة. استخدمي PNG أو JPEG أو WebP.' }, { status: 400 });
  const mime = match[1];
  const binary = Buffer.from(match[2], 'base64');
  if (binary.length > 4_000_000) return Response.json({ error: 'الصورة كبيرة جدًا؛ اختاري صورة أقل من 4 ميغابايت.' }, { status: 413 });
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
  const form = new FormData();
  form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
  form.append('prompt', 'Edit the provided photograph into a realistic, elegant hijab portrait. Preserve the person’s identity and facial features, expression, skin tone, face shape, pose, lighting and background as closely as possible. Replace only the visible hair and clothing as needed with a beautifully draped, opaque, modest hijab that fully covers all hair, the neck and chest. Use natural flowing fabric and choose a soft color that harmonizes with the person’s complexion and the photo (cream, beige, dusty rose, or another suitable muted tone). Keep the face unobstructed and realistic. Do not beautify, age-shift, reshape, or otherwise alter the face. Photorealistic fabric folds, natural shadows, high quality.');
  form.append('image', new Blob([binary], { type: mime }), `student.${ext}`);
  form.append('size', 'auto');
  form.append('quality', 'medium');
  try {
    const upstream = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error('Image provider error status:', upstream.status);
      return Response.json({ error: upstream.status === 401 ? 'مفتاح API غير صحيح.' : upstream.status === 429 ? 'وصلنا إلى حد الاستخدام أو الرصيد. تحققي من حساب API.' : 'تعذر تعديل الصورة لدى مزود الخدمة. تحققي من إعدادات الحساب ثم أعيدي المحاولة.' }, { status: upstream.status === 429 ? 429 : 502 });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return Response.json({ error: 'لم يرجع مزود الخدمة ملف الصورة المتوقع.' }, { status: 502 });
    return Response.json({ imageDataUrl: `data:image/png;base64,${b64}` }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Image edit request failed:', error?.message || 'unknown error');
    return Response.json({ error: 'تعذر الاتصال بخدمة تعديل الصور. حاولي مرة أخرى لاحقًا.' }, { status: 502 });
  }
};

export const config = { path: '/api/hijab', method: 'POST' };
