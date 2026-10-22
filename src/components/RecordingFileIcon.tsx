import { FileText, Image, Mic } from 'lucide-react';
import type { RecordingItem } from '../types';

export function RecordingFileIcon({ item }: { item: RecordingItem }) {
  const image = ['png', 'jpg', 'jpeg', 'webp'].includes(item.ext);
  const Icon = image ? Image : item.ext === 'pdf' ? FileText : Mic;
  const label = image ? 'תמונה' : item.ext === 'pdf' ? 'מסמך' : 'הקלטה';
  return <span role="img" aria-label={label} className="inline-flex shrink-0 text-indigo-600"><Icon aria-hidden="true" className="w-4 h-4" /></span>;
}
