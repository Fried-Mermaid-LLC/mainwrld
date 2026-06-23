import React from 'react';
import { AvatarConfig, AvatarItem, AvatarCategory, AvatarGender } from '@/types';
import { BASE } from '@/config/config';
import { SafeImg } from '@/components/SafeImg';

export const DEFAULT_HAIR_POSITIONS: Record<string, { width: string; left: string; top: string }> = {
  W_Hair_1:    { width: '33%', left: '33.5%', top: '-2.5%' },
  W_Hair_2:    { width: '35.5%', left: '32.5%', top: '-1.5%' },
  W_Hair_2_Variation1: { width: '35.5%', left: '32.5%', top: '-1.5%' },
  W_Hair_3:    { width: '35%', left: '32%', top: '-2.5%' },
  W_Hair_4:    { width: '43.5%', left: '28.5%', top: '-4.5%' },
  W_Hair_4_Variation1: { width: '43.5%', left: '28.5%', top: '-4.5%' },
  W_Hair_5:    { width: '42%', left: '29%', top: '-1.5%' },
  W_Hair_5_Variation1: { width: '42%', left: '29%', top: '-1.5%' },
  M_Hair1:    { width: '31%', left: '34%', top: '-4.5%' },
  M_Hair2:    { width: '36%', left: '32%', top: '-2.5%' },
  M_Hair3:    { width: '34%', left: '33.5%', top: '-4%' },
  M_Hair4:    { width: '29%', left: '35.5%', top: '-3%' },
  M_Hair4_variation1: { width: '29%', left: '35.5%', top: '-3%' },
  M_Hair5:    { width: '37.5%', left: '31.5%', top: '-4%' },
  M_Hair5_variation1: { width: '37.5%', left: '31.5%', top: '-4%' },
};

export const DEFAULT_FACE_POSITIONS: Record<string, { width: string; left: string; top: string }> = {
  W_Eye_1:     { width: '23%', left: '38.5%', top: '8%' },
  W_Eye_2:     { width: '23%', left: '38.5%', top: '7.5%' },
  W_Eye_3:     { width: '21%', left: '39.5%', top: '8%' },
  W_Eye_1_Variation1:  { width: '28%', left: '36%', top: '4.5%' },
  W_Eye_2_Variation1:  { width: '28%', left: '36%', top: '4.5%' },
  W_Eye_3_Variation1:  { width: '21%', left: '39.5%', top: '8%' },
  M_Eye_1:     { width: '28%', left: '36%', top: '7%' },
  M_Eye_2:     { width: '22%', left: '39%', top: '7%' },
  M_Eye_3:     { width: '22%', left: '39%', top: '7%' },
  M_Eye_1_variation_1:  { width: '28%', left: '36%', top: '7%' },
  M_Eye_1_variation_2:  { width: '28%', left: '36%', top: '7%' },
  M_Eye_2_variation_1:  { width: '23%', left: '38.5%', top: '7%' },
  M_Eye_2_variation_2:  { width: '24%', left: '38%', top: '6.5%' },
  M_Eye_3_variation_1:  { width: '21%', left: '39.5%', top: '7.5%' },
  M_Eye_3_variation_2:  { width: '21%', left: '39.5%', top: '7.5%' },
};

export const loadPositions = (key: string, defaults: Record<string, { width: string; left: string; top: string }>) => {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return { ...defaults, ...JSON.parse(saved) };
  } catch {
    // ignore invalid data
  }
  return { ...defaults };
};

export const HAIR_POSITIONS = loadPositions('mainwrld_hair_positions', DEFAULT_HAIR_POSITIONS);
export const FACE_POSITIONS = loadPositions('mainwrld_face_positions', DEFAULT_FACE_POSITIONS);

export const getHairPosition = (hairId: string, shrink = 1, shift = 0) => {
  const pos = HAIR_POSITIONS[hairId] || { width: '30%', left: '34%', top: '2%' };
  if (shrink === 1 && shift === 0) return pos;
  const origW = parseFloat(pos.width);
  const origL = parseFloat(pos.left);
  const newW = +(origW * shrink).toFixed(3);
  const newL = +(origL + (origW - newW) / 2 + shift).toFixed(3);
  return { width: `${newW}%`, left: `${newL}%`, top: pos.top };
};

export const getFacePosition = (faceId: string, shrink = 1) => {
  const pos = FACE_POSITIONS[faceId] || { width: '28%', left: '36%', top: '4.5%' };
  if (shrink === 1) return pos;
  const origW = parseFloat(pos.width);
  const origL = parseFloat(pos.left);
  const newW = +(origW * shrink).toFixed(3);
  const newL = +(origL + (origW - newW) / 2).toFixed(3);
  return { width: `${newW}%`, left: `${newL}%`, top: pos.top };
};

export const AVATAR_ITEMS: AvatarItem[] = [

  // MALE BODY (B)

  { id: 'B1', label: 'Tone 1', path: `${BASE}assets/avatar/body/male/B1.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B2', label: 'Tone 2', path: `${BASE}assets/avatar/body/male/B2.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B3', label: 'Tone 3', path: `${BASE}assets/avatar/body/male/B3.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B4', label: 'Tone 4', path: `${BASE}assets/avatar/body/male/B4.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B5', label: 'Tone 5', path: `${BASE}assets/avatar/body/male/B5.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B5_5', label: 'Tone 5.5', path: `${BASE}assets/avatar/body/male/B5.5.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B6', label: 'Tone 6', path: `${BASE}assets/avatar/body/male/B6.png`, category: 'body', gender: 'male', cost: 0 },
  { id: 'B7', label: 'Tone 7', path: `${BASE}assets/avatar/body/male/B7.png`, category: 'body', gender: 'male', cost: 0 },

  // MALE HAIR (H)

  { id: 'M_Hair1', label: 'Hair 1', path: `${BASE}assets/avatar/hair/male/M_Hair_1.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair2', label: 'Hair 2', path: `${BASE}assets/avatar/hair/male/M_Hair_2.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair3', label: 'Hair 3', path: `${BASE}assets/avatar/hair/male/M_Hair_3.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair4', label: 'Hair 4', path: `${BASE}assets/avatar/hair/male/M_Hair_4.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair4_variation1', label: 'Hair 4 Alt', path: `${BASE}assets/avatar/hair/male/M_Hair_4_v1.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair5', label: 'Hair 5', path: `${BASE}assets/avatar/hair/male/M_Hair_5.png`, category: 'hair', gender: 'male', cost: 0 },
  { id: 'M_Hair5_variation1', label: 'Hair 5 Alt', path: `${BASE}assets/avatar/hair/male/M_Hair_5_v1.png`, category: 'hair', gender: 'male', cost: 0 },

  // MALE FACE (M)

  { id: 'M_Eye_1', label: 'Face 1', path: `${BASE}assets/avatar/face/M_Eye_1.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_1_variation_1', label: 'Face 1 Alt', path: `${BASE}assets/avatar/face/M_Eye_1_v1.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_1_variation_2', label: 'Face 1 Alt 2', path: `${BASE}assets/avatar/face/M_Eye_1_v2.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_2', label: 'Face 2', path: `${BASE}assets/avatar/face/M_Eye_2.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_2_variation_1', label: 'Face 2 Alt', path: `${BASE}assets/avatar/face/M_Eye_2_v1.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_2_variation_2', label: 'Face 2 Alt 2', path: `${BASE}assets/avatar/face/M_Eye_2_v2.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_3', label: 'Face 3', path: `${BASE}assets/avatar/face/M_Eye_3.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_3_variation_1', label: 'Face 3 Alt', path: `${BASE}assets/avatar/face/M_Eye_3_v1.png`, category: 'face', gender: 'male', cost: 0 },
  { id: 'M_Eye_3_variation_2', label: 'Face 3 Alt 2', path: `${BASE}assets/avatar/face/M_Eye_3_v2.png`, category: 'face', gender: 'male', cost: 0 },

  // MALE OUTFIT (E)

  { id: 'E1', label: 'Outfit 1', path: `${BASE}assets/avatar/outfit/male/E1.png`, category: 'outfit', gender: 'male', cost: 0 },
  { id: 'E2', label: 'Outfit 2', path: `${BASE}assets/avatar/outfit/male/E2.png`, category: 'outfit', gender: 'male', cost: 0 },
  { id: 'E3', label: 'Outfit 3', path: `${BASE}assets/avatar/outfit/male/E3.png`, category: 'outfit', gender: 'male', cost: 0 },
  { id: 'E4', label: 'Outfit 4', path: `${BASE}assets/avatar/outfit/male/E4.png`, category: 'outfit', gender: 'male', cost: 0 },
  { id: 'E5', label: 'Outfit 5', path: `${BASE}assets/avatar/outfit/male/E5.png`, category: 'outfit', gender: 'male', cost: 0 },
  { id: 'E6', label: 'Outfit 6', path: `${BASE}assets/avatar/outfit/male/E6.png`, category: 'outfit', gender: 'male', cost: 0 },

  // end of male

  // NONE / DEFAULT

  { id: 'no_face', label: 'No Face', path: '', category: 'face', gender: 'any', cost: 0 },
  { id: 'none', label: 'No Hair', path: '', category: 'hair', gender: 'any', cost: 0 },

  // FEMALE FACE (W)

  { id: 'W_Eye_1', label: 'Face 1', path: `${BASE}assets/avatar/face/W_Eye_1.png`, category: 'face', gender: 'female', cost: 0 },
  { id: 'W_Eye_2', label: 'Face 2', path: `${BASE}assets/avatar/face/W_Eye_2.png`, category: 'face', gender: 'female', cost: 0 },
  { id: 'W_Eye_3', label: 'Face 3', path: `${BASE}assets/avatar/face/W_Eye_3.png`, category: 'face', gender: 'female', cost: 0 },
  { id: 'W_Eye_3_Variation1', label: 'Face 3 Alt', path: `${BASE}assets/avatar/face/W_Eye_3_v1.png`, category: 'face', gender: 'female', cost: 0 },

  // FEMALE BODY (A)

  { id: 'A1', label: 'Tone 1', path: `${BASE}assets/avatar/body/female/A1.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A2', label: 'Tone 2', path: `${BASE}assets/avatar/body/female/A2.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A3', label: 'Tone 3', path: `${BASE}assets/avatar/body/female/A3.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A4', label: 'Tone 4', path: `${BASE}assets/avatar/body/female/A4.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A5', label: 'Tone 5', path: `${BASE}assets/avatar/body/female/A5.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A5_5', label: 'Tone 5.5', path: `${BASE}assets/avatar/body/female/A5.5.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A6', label: 'Tone 6', path: `${BASE}assets/avatar/body/female/A6.png`, category: 'body', gender: 'female', cost: 0 },
  { id: 'A7', label: 'Tone 7', path: `${BASE}assets/avatar/body/female/A7.png`, category: 'body', gender: 'female', cost: 0 },

  // FEMALE HAIR (W)

  { id: 'W_Hair_1', label: 'Hair 1', path: `${BASE}assets/avatar/hair/female/W_Hair_1.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_2', label: 'Hair 2', path: `${BASE}assets/avatar/hair/female/W_Hair_2.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_2_Variation1', label: 'Hair 2 Alt', path: `${BASE}assets/avatar/hair/female/W_Hair_2_v1.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_3', label: 'Hair 3', path: `${BASE}assets/avatar/hair/female/W_Hair_3.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_4', label: 'Hair 4', path: `${BASE}assets/avatar/hair/female/W_Hair_4.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_4_Variation1', label: 'Hair 4 Alt', path: `${BASE}assets/avatar/hair/female/W_Hair_4_v1.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_5', label: 'Hair 5', path: `${BASE}assets/avatar/hair/female/W_Hair_5.png`, category: 'hair', gender: 'female', cost: 0 },
  { id: 'W_Hair_5_Variation1', label: 'Hair 5 Alt', path: `${BASE}assets/avatar/hair/female/W_Hair_5_v1.png`, category: 'hair', gender: 'female', cost: 0 },

  // FEMALE OUTFIT (D)

  { id: 'D1', label: 'Outfit 1', path: `${BASE}assets/avatar/outfit/female/D1.png`, category: 'outfit', gender: 'female', cost: 0 },
  { id: 'D2', label: 'Outfit 2', path: `${BASE}assets/avatar/outfit/female/D2.png`, category: 'outfit', gender: 'female', cost: 0 },
  { id: 'D3', label: 'Outfit 3', path: `${BASE}assets/avatar/outfit/female/D3.png`, category: 'outfit', gender: 'female', cost: 0 },
  { id: 'D4', label: 'Outfit 4', path: `${BASE}assets/avatar/outfit/female/D4.png`, category: 'outfit', gender: 'female', cost: 0 },
  { id: 'D5', label: 'Outfit 5', path: `${BASE}assets/avatar/outfit/female/D5.png`, category: 'outfit', gender: 'female', cost: 0 },
  { id: 'D6', label: 'Outfit 6', path: `${BASE}assets/avatar/outfit/female/D6.png`, category: 'outfit', gender: 'female', cost: 0 },

];

export const getAvatarItemPath = (category: AvatarCategory, id: string): string => {
  const item = AVATAR_ITEMS.find(i => i.id === id);
  return item?.path || '';
};

interface AvatarLayersProps {
  avatarConfig: AvatarConfig;
  containerClassName?: string;
  containerStyle?: React.CSSProperties;
  faceShrink?: number;
  hairShrink?: number;
  hairShift?: number;
  faceStyleOverride?: React.CSSProperties;
  hairStyleOverride?: React.CSSProperties;
}

export const AvatarLayers = ({
  avatarConfig,
  containerClassName,
  containerStyle,
  faceShrink = 0.94,
  hairShrink = 0.918,
  hairShift = 0.33,
  faceStyleOverride,
  hairStyleOverride,
}: AvatarLayersProps) => {
  const faceStyle = faceStyleOverride ?? getFacePosition(avatarConfig.faceId, faceShrink);
  const hairStyle = hairStyleOverride ?? getHairPosition(avatarConfig.hairId, hairShrink, hairShift);

  // Resolve item image paths up-front and only render an <img> when the path is
  // non-empty — passing src="" makes the browser re-download the whole page and
  // spams the console with empty-src warnings.
  const bodySrc = getAvatarItemPath('body', avatarConfig.bodyId);
  const faceSrc = getAvatarItemPath('face', avatarConfig.faceId);
  const outfitSrc = getAvatarItemPath('outfit', avatarConfig.outfitId);
  const hairSrc = getAvatarItemPath('hair', avatarConfig.hairId);

  return (
    <div className={containerClassName} style={containerStyle}>
      {bodySrc && <SafeImg src={bodySrc} className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: 1 }} />}
      {avatarConfig.faceId !== 'no_face' && faceSrc && <SafeImg src={faceSrc} className="absolute" style={{ zIndex: 2, ...faceStyle}} />}
      {outfitSrc && <SafeImg src={outfitSrc} className="absolute inset-0 w-full h-full object-contain" style={{ zIndex: 3 }} />}
      {avatarConfig.hairId !== 'none' && hairSrc && <SafeImg src={hairSrc} className="absolute" style={{ zIndex: 4, ...hairStyle}} />}
    </div>
  );
};

export default {
  DEFAULT_HAIR_POSITIONS,
  DEFAULT_FACE_POSITIONS,
  loadPositions,
  HAIR_POSITIONS,
  FACE_POSITIONS,
  getHairPosition,
  getFacePosition,
  AVATAR_ITEMS,
  getAvatarItemPath,
  AvatarLayers,
};