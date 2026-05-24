/**
 * MediaUploader.jsx
 * Composant réutilisable d'upload vers Cloudinary.
 * Utilisé pour : avatar talent, coverImageUrl checkpoint/event/moment (futures intégrations).
 *
 * Props :
 *   cloudName       — string, ton cloud Cloudinary (VITE_CLOUDINARY_CLOUD_NAME)
 *   uploadPreset    — string, preset unsigned (VITE_CLOUDINARY_UPLOAD_PRESET)
 *   folder          — string optionnel, ex: "microrave/avatars"
 *   value           — string, URL actuelle (contrôlé)
 *   onChange        — (url: string | null) => void, appelé après upload réussi ou retrait
 *   accept          — string, défaut "image/*"
 *   maxFileSizeMB   — number, défaut 10
 *   disabled        — bool
 *   shape           — "square" | "circle", défaut "square" — contrôle le rendu de l'aperçu
 *   label           — string, texte du bouton principal
 */

import React, { useRef, useState } from 'react';
import { Upload, Loader2, X, Camera } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_MB_DEFAULT = 10;
const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];

function humanSize(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaUploader({
  cloudName,
  uploadPreset,
  folder,
  value = '',
  onChange,
  accept = 'image/*',
  maxFileSizeMB = MAX_MB_DEFAULT,
  disabled = false,
  shape = 'square',
  label = 'Changer la photo',
}) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  // Validation config — erreur lisible si Cloudinary n'est pas configuré
  const missingConfig = !cloudName || !uploadPreset;

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');

    // Validation type
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Format non supporté. Utilise JPG, PNG ou WEBP.');
      return;
    }

    // Validation taille
    const maxBytes = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      setError(`Fichier trop volumineux (${humanSize(file.size)}). Maximum : ${maxFileSizeMB} MB.`);
      return;
    }

    try {
      setUploading(true);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('upload_preset', uploadPreset);
      if (folder) formData.append('folder', folder);

      const res = await fetch(
        `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
        { method: 'POST', body: formData }
      );

      const payload = await res.json();

      if (!res.ok) {
        throw new Error(payload?.error?.message || 'Erreur Cloudinary.');
      }

      const secureUrl = payload?.secure_url;
      if (!secureUrl) throw new Error("Cloudinary n'a pas retourné d'URL.");

      onChange?.(secureUrl);
    } catch (err) {
      setError(err?.message || "Erreur lors de l'upload.");
    } finally {
      setUploading(false);
      // Reset input pour permettre de re-sélectionner le même fichier
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function handleRemove() {
    setError('');
    onChange?.(null);
    if (inputRef.current) inputRef.current.value = '';
  }

  const isCircle = shape === 'circle';
  const previewClass = isCircle
    ? 'w-24 h-24 rounded-full object-cover ring-2 ring-white/30'
    : 'w-full max-h-52 rounded-xl object-cover';

  if (missingConfig) {
    return (
      <div className="text-xs text-red-500 border border-red-200 rounded-lg p-3 bg-red-50">
        Configuration manquante —{' '}
        <code>VITE_CLOUDINARY_CLOUD_NAME</code> et{' '}
        <code>VITE_CLOUDINARY_UPLOAD_PRESET</code> sont requis.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Aperçu + actions */}
      {value ? (
        <div className={`flex ${isCircle ? 'flex-col items-center gap-2' : 'flex-col gap-2'}`}>
          <img src={value} alt="Aperçu" className={previewClass} />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? (
                <><Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />Upload...</>
              ) : (
                <><Camera className="w-3.5 h-3.5 mr-1" />{label}</>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRemove}
              disabled={disabled || uploading}
              className="text-red-500 hover:text-red-600 hover:bg-red-50"
            >
              <X className="w-3.5 h-3.5 mr-1" />Retirer
            </Button>
          </div>
        </div>
      ) : (
        /* Zone vide — clic pour uploader */
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className={`
            flex flex-col items-center justify-center gap-2 border-2 border-dashed border-gray-200
            hover:border-indigo-300 hover:bg-indigo-50/40 transition-all text-gray-400
            hover:text-indigo-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
            ${isCircle ? 'w-24 h-24 rounded-full' : 'w-full h-28 rounded-xl'}
          `}
        >
          {uploading
            ? <Loader2 className="w-6 h-6 animate-spin" />
            : <Upload className="w-6 h-6" />
          }
          <span className="text-xs font-medium">
            {uploading ? 'Upload...' : label}
          </span>
        </button>
      )}

      {/* Input caché */}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled || uploading}
        onChange={handleFileChange}
      />

      {/* Erreur */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}