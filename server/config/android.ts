/**
 * The Android app: who it is, which builds the API still serves, and where its
 * releases are published.
 *
 * Everything here is public - a package name and a certificate's fingerprint
 * are printed on every installed copy - so the defaults live in the code and
 * the environment only overrides them.
 */

/** The app's package name, as installed. */
export const androidPackageName = (): string => process.env.ANDROID_PACKAGE_NAME?.trim() || 'io.github.utshabasak.bookstorebd';

/**
 * SHA-256 fingerprints of the certificates the app is signed with, for
 * Android App Links (/.well-known/assetlinks.json). Comma-separated in
 * ANDROID_CERT_SHA256 to add another, such as Play's signing key later.
 */
export const androidCertFingerprints = (): string[] => {
  const configured = (process.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  return configured.length
    ? configured
    : ['11:39:B7:92:CA:48:CF:12:88:0D:10:64:F3:40:19:DC:7F:8B:F3:94:34:B0:1A:45:DA:0C:07:06:81:FA:A5:B9'];
};

/**
 * The oldest build the API still serves, by version code. Older builds are
 * answered 426 with `code: 'app-update-required'`, and the app asks to be
 * updated. Zero serves every build.
 */
export const androidMinVersionCode = (): number => {
  const value = Number(process.env.ANDROID_MIN_VERSION_CODE ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

/** The GitHub repository whose Releases carry the APK. */
export const androidReleasesRepo = (): string => process.env.ANDROID_RELEASES_REPO?.trim() || 'UtshaBasak/BookStoreBD-Android';

/**
 * The version code the app's build derives from its version name: 1.2.3 is
 * 10203. The same formula as `app/build.gradle.kts`, so a release tag can be
 * compared with an installed build.
 */
export const versionCodeFor = (versionName: string): number | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(versionName.trim());
  if (!match) return null;
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) return null;
  return major * 10_000 + minor * 100 + patch;
};
