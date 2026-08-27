import { initializeApp, getApps } from 'firebase-admin/app';
if (!getApps().length) initializeApp();

export {searchSongs} from "./searchSongs";
export {updateFMLiveState} from "./fmLiveState";
// New CFs - enable after fixing timeout issue
// export {generateFMContentMorning, generateFMContentAfternoon} from "./generateFMContent";
// export {generateFMAudioMorning, generateFMAudioAfternoon} from "./generateFMAudioCF";