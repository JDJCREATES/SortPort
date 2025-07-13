export interface PhotoLoaderInterface {
  loadAllPhotoIds(selectedFolders: string[]): Promise<Array<{id: string, uri: string, folderId?: string}>>;
  requestPermissions(): Promise<'granted' | 'denied' | 'undetermined'>;
}

export interface AlbumUtilsInterface {
  getNsfwImageIds(): Promise<string[]>;
}