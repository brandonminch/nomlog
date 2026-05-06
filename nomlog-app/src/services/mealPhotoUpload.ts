import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';
import { apiClient } from '../lib/api';

const extra = Constants.expoConfig?.extra as { mealPhotoBucket?: string } | undefined;
const MEAL_PHOTO_BUCKET =
  extra?.mealPhotoBucket ?? process.env.EXPO_PUBLIC_MEAL_PHOTO_BUCKET ?? 'meal-photos';

const debugMealPhoto = (...args: unknown[]) => {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log('[mealPhotoUpload]', ...args);
  }
};

export type MealPhotoUploadInput = {
  localUri: string;
  mimeType?: string | null;
  fileName?: string | null;
};

export type MealPhotoUploadResult = {
  path: string;
};

function inferFileExtension(input: MealPhotoUploadInput): string {
  const fromFileName = input.fileName?.split('.').pop()?.trim().toLowerCase();
  if (fromFileName && fromFileName.length <= 5) {
    return fromFileName;
  }
  const fromMime = input.mimeType?.split('/').pop()?.trim().toLowerCase();
  if (fromMime && fromMime.length <= 5) {
    return fromMime === 'jpeg' ? 'jpg' : fromMime;
  }
  const uriWithoutQuery = input.localUri.split('?')[0];
  const fromUri = uriWithoutQuery.split('.').pop()?.trim().toLowerCase();
  if (fromUri && fromUri.length <= 5) {
    return fromUri;
  }
  return 'jpg';
}

async function buildMealPhotoFormData(input: MealPhotoUploadInput): Promise<FormData> {
  const ext = inferFileExtension(input);
  const normalizedMimeType = input.mimeType || (ext === 'png' ? 'image/png' : 'image/jpeg');
  const formData = new FormData();

  if (Platform.OS === 'web') {
    const response = await fetch(input.localUri);
    if (!response.ok) {
      throw new Error('Unable to read selected photo for upload.');
    }
    const blob = await response.blob();
    formData.append('photo', blob, `meal-photo.${ext}`);
  } else {
    formData.append(
      'photo',
      {
        uri: input.localUri,
        type: normalizedMimeType,
        name: `meal-photo.${ext}`,
      } as unknown as Blob,
    );
  }

  return formData;
}

/**
 * Upload meal photo via Nomlog API → Supabase Storage (avoids RN direct uploads to *.supabase.co, which often fail with "Network request failed").
 */
export async function uploadMealPhotoToStorage(
  input: MealPhotoUploadInput,
): Promise<MealPhotoUploadResult> {
  debugMealPhoto('start (API proxy)', {
    platform: Platform.OS,
    uriScheme: input.localUri.split(':')[0] ?? 'unknown',
    bucket: MEAL_PHOTO_BUCKET,
  });

  const formData = await buildMealPhotoFormData(input);
  const data = await apiClient.postFormData('/api/v1/meal-photos', formData);

  if (!data || typeof data.path !== 'string' || !data.path.length) {
    debugMealPhoto('invalid response', data);
    throw new Error('Upload failed: invalid server response');
  }

  debugMealPhoto('ok', { path: data.path });
  return { path: data.path };
}

/** Signed URLs for viewing meal photos in the private bucket (RLS: user's folder). */
export async function getSignedMealPhotoUrls(
  storagePaths: string[],
  expiresInSec: number = 3600,
): Promise<string[]> {
  const unique = [...new Set(storagePaths.filter((p) => typeof p === 'string' && p.length > 0))].slice(
    0,
    4,
  );
  if (unique.length === 0) return [];

  const settled = await Promise.all(
    unique.map(async (path) => {
      const { data, error } = await supabase.storage
        .from(MEAL_PHOTO_BUCKET)
        .createSignedUrl(path, expiresInSec);
      if (error || !data?.signedUrl) {
        console.warn('[mealPhoto] createSignedUrl failed', path, error?.message);
        return null;
      }
      return data.signedUrl;
    }),
  );
  return settled.filter((u): u is string => u != null);
}
