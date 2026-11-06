/** Public social content uses private staging. The final random URL contains
 * no author ID and has no object until a review permits publication. */
export const socialPendingBucket=(kind:'image'|'audio'|'video')=>`ugc-pending-${kind}`;
export const SOCIAL_APPROVED_BUCKET='ugc-approved';
export const SOCIAL_MEDIA_TYPES: Record<string,{ext:string;kind:'image'|'audio'|'video';max:number}>={
 'image/jpeg':{ext:'jpg',kind:'image',max:5*1024*1024},'image/png':{ext:'png',kind:'image',max:5*1024*1024},
 'image/webp':{ext:'webp',kind:'image',max:5*1024*1024},'image/gif':{ext:'gif',kind:'image',max:5*1024*1024},
 'audio/mp4':{ext:'m4a',kind:'audio',max:10*1024*1024},'audio/mpeg':{ext:'mp3',kind:'audio',max:10*1024*1024},
 'audio/webm':{ext:'webm',kind:'audio',max:10*1024*1024},'audio/ogg':{ext:'ogg',kind:'audio',max:10*1024*1024},'audio/aac':{ext:'aac',kind:'audio',max:10*1024*1024},
 'video/mp4':{ext:'mp4',kind:'video',max:1024*1024*1024},'video/quicktime':{ext:'mov',kind:'video',max:1024*1024*1024},'video/webm':{ext:'webm',kind:'video',max:1024*1024*1024},'video/ogg':{ext:'ogg',kind:'video',max:1024*1024*1024},
};
