import { loadUserDatabase, type UserDatabase } from './user-db.js';

/**
 * Ported verbatim from VBA `MoGUser.bas`. When this needs to change in
 * production without a release, migrate to runtime-fetched `users.json`
 * hosted alongside the bundle on GitHub Pages — the schema contract
 * (`userDatabaseSchema`) does not change.
 *
 * Data is validated at module load; a bad entry fails loud at startup.
 */
const RAW_DATA = {
  defaultUserKey: 'default',
  users: [
    {
      key: 'default',
      shortName: 'Någon Okänd',
      fullName: 'Någon Okänd',
      mileageKrPerKm: 37.0,
      title: 'Biträdande jurist',
      city: 'Lund',
      aliases: ['default', 'nagon', 'okand', 'unknown'],
    },
    {
      key: 'cecilia',
      shortName: 'Cecilia',
      fullName: 'Cecilia Moll',
      mileageKrPerKm: 9.5,
      title: 'Advokat',
      city: 'Lund',
      aliases: ['ceciliamoll'],
    },
    {
      key: 'alma',
      shortName: 'Alma',
      fullName: 'Alma Diaz Råm',
      mileageKrPerKm: 37.0,
      title: 'Biträdande jurist',
      city: 'Lund',
      aliases: ['almadiazramo', 'almaramo'],
    },
    {
      key: 'ulrik',
      shortName: 'Ulrik',
      fullName: 'Ulrik Sjölin',
      mileageKrPerKm: 483.99,
      title: 'Ers Kjeserliga Överhöghet',
      city: 'Utopia',
      aliases: ['ulriksjolin', 'ulriksjoelin', 'ulriksjolin1'],
    },
    {
      key: 'mans',
      shortName: 'Måns',
      fullName: 'Måns Bergendorff',
      mileageKrPerKm: 37.0,
      title: 'Advokat',
      city: 'Malmö',
      aliases: ['mansbergendorff'],
    },
    {
      key: 'azar',
      shortName: 'Azar',
      fullName: 'Azar Akbarian',
      mileageKrPerKm: 37.0,
      title: 'Biträdande jurist',
      city: 'Malmö',
      aliases: ['azarakbarian'],
    },
    {
      key: 'petra',
      shortName: 'Petra',
      fullName: 'Petra Ramberg Persson',
      mileageKrPerKm: 37.0,
      title: 'Advokat',
      city: 'Lund',
      aliases: ['petrarambergpersson', 'petrapersson'],
    },
    {
      key: 'annette',
      shortName: 'Annette',
      fullName: 'Annette Lantz',
      mileageKrPerKm: 37.0,
      title: 'Advokatsekreterare',
      city: 'Lund',
      aliases: ['annettelantz'],
    },
    {
      key: 'maria',
      shortName: 'Maria',
      fullName: 'Maria Grosskopf',
      mileageKrPerKm: 12.0,
      title: 'Advokat',
      city: 'Lund',
      aliases: ['mariagrosskopf'],
    },
    {
      key: 'jakobenoksson',
      shortName: 'Jakob',
      fullName: 'Jakob Enoksson',
      mileageKrPerKm: 37.0,
      title: 'Biträdande jurist',
      city: 'Lund',
      aliases: ['jakobenoksson', 'jakobenokson'],
    },
  ],
};

export const USERS: UserDatabase = loadUserDatabase(RAW_DATA);
