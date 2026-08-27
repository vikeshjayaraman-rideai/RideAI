import RNFS from 'react-native-fs';

// Keep local save as fallback
export const savePhotoLocally = async (
  uri: string,
  fileName: string,
): Promise<string> => {
  const destPath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
  await RNFS.copyFile(uri, destPath);
  return `file://${destPath}`;
};

// Upload to Imgur and return public URL
export const uploadPhotoToImgur = async (uri: string): Promise<string> => {
  const formData = new FormData();
  formData.append('image', {
    uri,
    type: 'image/jpeg',
    name: `photo_${Date.now()}.jpg`,
  } as any);

  const response = await fetch('https://api.imgur.com/3/image', {
    method: 'POST',
    headers: {
      'Authorization': 'Client-ID 546c25a59c58ad7',
    },
    body: formData,
  });

  const data = await response.json();
  console.log('Imgur response:', JSON.stringify(data)); // ADD THIS
  if (data.success) {
    return data.data.link;
  }
  throw new Error('Imgur upload failed: ' + (data.data?.error || JSON.stringify(data)));
};

// Upload photo — tries Imgur first, falls back to local
export const uploadPhoto = async (
  uri: string,
  fileName: string,
): Promise<string> => {
  const imgurUrl = await uploadPhotoToImgur(uri);
  return imgurUrl;
};