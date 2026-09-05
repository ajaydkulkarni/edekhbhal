import {
 readFileSync,
} from "node:fs";
import {
 describe,
 expect,
 it,
} from "vitest";

const scanner=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/qr-start-scanner.tsx",
 "utf8"
);

const page=readFileSync(
 "src/app/workspace/my-work/[occurrenceId]/page.tsx",
 "utf8"
);

describe(
 "Mobile Field Execution 05A QR scanner",
 ()=>{
  it(
   "uses the MOBILE server start command",
   ()=>{
    expect(scanner).toContain(
     "startOccurrenceMobile"
    );

    expect(scanner).toContain(
     'action={startOccurrenceMobile}'
    );
   }
  );

  it(
   "requests device camera with rear-camera preference",
   ()=>{
    expect(scanner).toContain(
     "navigator.mediaDevices"
    );

    expect(scanner).toContain(
     ".getUserMedia({"
    );

    expect(scanner).toContain(
     'ideal:"environment"'
    );

    expect(scanner).toContain(
     "playsInline"
    );
   }
  );

  it(
   "uses QR-only BarcodeDetector when supported",
   ()=>{
    expect(scanner).toContain(
     "BarcodeDetector"
    );

    expect(scanner).toContain(
     'formats:["qr_code"]'
    );

    expect(scanner).toContain(
     'formats.includes("qr_code")'
    );
   }
  );

  it(
   "extracts the token from the canonical public QR URL",
   ()=>{
    expect(scanner).toContain(
     'parts[0]==="q"'
    );

    expect(scanner).toContain(
     "parts.length===2"
    );

    expect(scanner).toContain(
     "decodeURIComponent("
    );
   }
  );

  it(
   "retains manual token entry as a complete fallback",
   ()=>{
    expect(scanner).toContain(
     'name="qrToken"'
    );

    expect(scanner).toContain(
     'placeholder="Scan or enter active QR token"'
    );

    expect(scanner).toContain(
     "setToken("
    );
   }
  );

  it(
   "does not automatically submit after a QR is detected",
   ()=>{
    expect(scanner).not.toContain(
     "requestSubmit("
    );

    expect(scanner).not.toContain(
     ".submit("
    );

    expect(scanner).toContain(
     "Confirm the token and choose Validate QR & Start."
    );
   }
  );

  it(
   "releases camera tracks on stop and component cleanup",
   ()=>{
    expect(scanner).toContain(
     ".getTracks()"
    );

    expect(scanner).toContain(
     "track=>track.stop()"
    );

    expect(scanner).toContain(
     "useEffect("
    );
   }
  );

  it(
   "fails over to manual entry when camera QR detection is unavailable",
   ()=>{
    expect(scanner).toContain(
     "This browser does not support in-browser QR detection."
    );

    expect(scanner).toContain(
     "Camera permission was denied."
    );
   }
  );

  it(
   "keeps QR capture separate from authorization",
   ()=>{
    expect(scanner).toContain(
     "The server still validates your membership"
    );

    expect(scanner).toContain(
     "exact active Work Area QR"
    );
   }
  );

  it(
   "integrates scanner only into the assigned PENDING start step",
   ()=>{
    expect(page).toContain(
     "QrStartScanner"
    );

    expect(page).toContain(
     "occurrenceId={occurrence.id}"
    );

    expect(page).not.toContain(
     "action={startOccurrenceMobile}"
    );
   }
  );
 }
);
