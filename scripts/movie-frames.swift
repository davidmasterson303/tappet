// movie-frames — walk a QuickTime movie and write a still every N milliseconds.
//
//   swiftc -O scripts/movie-frames.swift -o /tmp/movie-frames
//   xcrun simctl io <udid> recordVideo out.mov      # ^C to finalise
//   /tmp/movie-frames out.mov <outDir> <strideMs> [from to]
//
// Written 22 Sep 2026 for the switcher loop, where a design critic asked to
// see a 300ms transition and prose could not prove it. Pair it with
// `scripts/frame-rows.swift`: dump the frames, measure a band's luminance on
// each, and the transition becomes a number — "93.5 to 48.2 over 283ms,
// monotonic, no graphite frame" — rather than an impression. It is also what
// found two defects no still could: a name set over the *outgoing* car's
// plate, and a crossfade running while the page was still in its loading
// branch with nothing on screen.
//
// ⚠ simctl records at a variable rate: frames exist where the screen changed
// and nowhere else, so a stride is a ceiling rather than a cadence, and long
// still stretches simply have no frames in them.
//
//   frames <movie> <outDir> <strideMs> [<fromSec> <toSec>]
//
// ⚠ `AVAssetImageGenerator` was the first attempt and it returned the **first
// frame for every requested time** on simctl's recording — every still came
// back "actual 0.000s" and the ten files were byte-identical. Rather than
// guess at why (unloaded tracks, a single sync sample, the variable frame rate
// simctl writes), this reads the track sequentially with `AVAssetReader` and
// takes each sample's real presentation time. Sequential decoding cannot
// return a frame that is not there, which is the property that matters when
// the thing being measured is a 300ms transition.
//
// No ffmpeg on this machine; AVFoundation is in the SDK.
import Foundation
import AVFoundation
import CoreImage
import AppKit

let args = CommandLine.arguments
guard args.count >= 4, let strideMs = Double(args[3]) else {
  print("usage: frames <movie> <outDir> <strideMs> [from to]"); exit(2)
}
let outDir = args[2]
let from = args.count > 4 ? Double(args[4]) ?? 0 : 0
let to = args.count > 5 ? Double(args[5]) ?? .greatestFiniteMagnitude : .greatestFiniteMagnitude

let asset = AVURLAsset(url: URL(fileURLWithPath: args[1]))
guard let track = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(
  track: track,
  outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
)
reader.add(output)
reader.startReading()

let ctx = CIContext()
var lastWritten = -Double.greatestFiniteMagnitude
var written = 0

while let sample = output.copyNextSampleBuffer() {
  let t = CMSampleBufferGetPresentationTimeStamp(sample).seconds
  guard t >= from, t <= to else { continue }
  guard t - lastWritten >= strideMs / 1000 - 0.001 else { continue }
  guard let buffer = CMSampleBufferGetImageBuffer(sample) else { continue }

  let image = CIImage(cvPixelBuffer: buffer)
  guard let cg = ctx.createCGImage(image, from: image.extent) else { continue }
  let rep = NSBitmapImageRep(cgImage: cg)
  guard let png = rep.representation(using: .png, properties: [:]) else { continue }

  let path = "\(outDir)/t-\(String(format: "%05d", Int(t * 1000)))ms.png"
  try? png.write(to: URL(fileURLWithPath: path))
  lastWritten = t
  written += 1
}

print("\(written) frames, \(String(format: "%.2f", lastWritten))s of video")
