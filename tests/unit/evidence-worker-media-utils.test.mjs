import {describe,expect,it} from "vitest";
import {
  compareObservedToExpected,
  computeRetrySeconds,
  observedSource,
  sha256Hex,
  sniffContentType
} from "../../worker/lib/evidence-media.mjs";

describe("Evidence worker media utilities 03B2",()=>{
  it("sniffs only the supported image/video magic families",()=>{
    expect(sniffContentType(Buffer.from([0xff,0xd8,0xff,0x00]))).toBe("image/jpeg");
    expect(sniffContentType(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe("image/png");
    expect(sniffContentType(Buffer.from("RIFF0000WEBP","ascii"))).toBe("image/webp");

    const mp4=Buffer.alloc(16);mp4.write("ftyp",4,"ascii");mp4.write("isom",8,"ascii");
    const mov=Buffer.alloc(16);mov.write("ftyp",4,"ascii");mov.write("qt  ",8,"ascii");
    expect(sniffContentType(mp4)).toBe("video/mp4");
    expect(sniffContentType(mov)).toBe("video/quicktime");

    const webm=Buffer.concat([Buffer.from([0x1a,0x45,0xdf,0xa3]),Buffer.from("....webm","ascii")]);
    expect(sniffContentType(webm)).toBe("video/webm");
    expect(sniffContentType(Buffer.from("not-media"))).toBe("application/octet-stream");
  });

  it("computes SHA-256 independently from upload metadata",()=>{
    expect(sha256Hex(Buffer.alloc(0))).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const body=Buffer.from("evidence");
    const observed=observedSource(body);
    expect(observed.byteSize).toBe(body.length);
    expect(observed.sha256Hex).toBe(sha256Hex(body));
  });

  it("reports source metadata mismatches without trusting the expected values",()=>{
    const observed={
      contentType:"image/jpeg",
      byteSize:10,
      sha256Hex:"a".repeat(64)
    };
    expect(compareObservedToExpected(observed,{
      contentType:"image/jpeg",
      byteSize:10,
      sha256Hex:"a".repeat(64)
    }).matches).toBe(true);
    const mismatch=compareObservedToExpected(observed,{
      contentType:"image/png",
      byteSize:11,
      sha256Hex:"b".repeat(64)
    });
    expect(mismatch.matches).toBe(false);
    expect(mismatch.mismatches).toHaveLength(3);
  });

  it("uses bounded exponential retry delay",()=>{
    expect(computeRetrySeconds(1)).toBe(15);
    expect(computeRetrySeconds(2)).toBe(30);
    expect(computeRetrySeconds(3)).toBe(60);
    expect(computeRetrySeconds(20)).toBe(900);
  });
});
