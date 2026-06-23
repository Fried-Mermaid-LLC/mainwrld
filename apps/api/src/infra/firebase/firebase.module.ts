import { existsSync } from 'node:fs';
import { Global, Logger, Module, Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  applicationDefault,
  cert,
  initializeApp,
  type App,
} from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { getStorage } from 'firebase-admin/storage';
import type { AppConfiguration } from '../config/configuration';
import {
  FIREBASE_APP,
  FIREBASE_AUTH,
  FIREBASE_DB,
  FIREBASE_MESSAGING,
  FIREBASE_STORAGE,
  FIRESTORE,
} from './firebase.constants';

const appProvider: Provider = {
  provide: FIREBASE_APP,
  inject: [ConfigService],
  useFactory: (config: ConfigService<AppConfiguration, true>): App => {
    const fb = config.get('firebase', { infer: true });
    const logger = new Logger('FirebaseModule');
    // Local dev: a service-account JSON path, if the file is present. Otherwise
    // (Cloud Run, or local with `gcloud auth application-default login`) fall
    // back to ADC. Never bake the key file into the image.
    const useFile =
      !!fb.serviceAccountPath && existsSync(fb.serviceAccountPath);
    if (fb.serviceAccountPath && !useFile) {
      logger.warn(
        `Service account file not found at ${fb.serviceAccountPath}; falling back to applicationDefault() (ADC).`,
      );
    }
    return initializeApp({
      credential: useFile
        ? cert(fb.serviceAccountPath!)
        : applicationDefault(),
      projectId: fb.projectId,
      databaseURL: fb.databaseURL,
      storageBucket: fb.storageBucket,
    });
  },
};

const firestoreProvider: Provider = {
  provide: FIRESTORE,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => {
    const db = getFirestore(app);
    // Writing partial docs with `undefined` fields is common when porting the
    // client's update payloads — drop them instead of throwing.
    db.settings({ ignoreUndefinedProperties: true });
    return db;
  },
};

const authProvider: Provider = {
  provide: FIREBASE_AUTH,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => getAuth(app),
};

const storageProvider: Provider = {
  provide: FIREBASE_STORAGE,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => getStorage(app),
};

const messagingProvider: Provider = {
  provide: FIREBASE_MESSAGING,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => getMessaging(app),
};

const databaseProvider: Provider = {
  provide: FIREBASE_DB,
  inject: [FIREBASE_APP],
  useFactory: (app: App) => getDatabase(app),
};

const providers = [
  appProvider,
  firestoreProvider,
  authProvider,
  storageProvider,
  messagingProvider,
  databaseProvider,
];

@Global()
@Module({
  providers,
  exports: providers,
})
export class FirebaseModule {}
