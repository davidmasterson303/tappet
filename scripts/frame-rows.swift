// frame-rows — measure a native screenshot row by row, so a critic's "33pt"
// is checked against the frame rather than believed or eyeballed.
//
// Prints, for every pixel row in a band of the image, the mean luminance and
// the count of pixels brighter than 60 (text, marks) across an x range; rows
// that differ from their neighbour are printed, so hairlines show up as one
// bright row and text as a run of rows, and the distance between them is the
// measurement. On a 3x display divide by 3 for points.
//
//   swiftc -O scripts/frame-rows.swift -o /tmp/frame-rows
//   /tmp/frame-rows <png> <x0> <x1> [y0] [y1]
//
// Reads PNGs through ImageIO, so it needs a Mac with Xcode's toolchain and
// nothing else — no Python imaging library, which this machine does not
// have. Written 22 Sep 2026 for the hub's round 51 (`docs/design-system-
// drift.md` §6.21), when the design critic measured a count row's numerals
// 19pt apart and the TIRES band's reading 33pt under its hairline; both
// were true to the point, and a scaled still could not have said so.
import Foundation
import CoreGraphics
import ImageIO

let args = CommandLine.arguments
guard args.count >= 4,
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let x0 = Int(args[2]), let x1 = Int(args[3])
else {
  FileHandle.standardError.write("usage: frame-rows <png> <x0> <x1> [y0] [y1]\n".data(using: .utf8)!)
  exit(2)
}
let width = image.width, height = image.height
let y0 = args.count > 4 ? Int(args[4]) ?? 0 : 0
let y1 = args.count > 5 ? min(Int(args[5]) ?? height, height) : height
guard x0 >= 0, x1 <= width, x0 < x1, y0 >= 0, y0 < y1 else {
  FileHandle.standardError.write("range outside the \(width)×\(height) image\n".data(using: .utf8)!)
  exit(2)
}

var pixels = [UInt8](repeating: 0, count: width * height * 4)
let context = CGContext(
  data: &pixels, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
  space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!
context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))

var previous = -1.0
for y in y0..<y1 {
  var sum = 0.0, bright = 0, peak = 0
  for x in x0..<x1 {
    let i = (y * width + x) * 4
    let luminance = Int(0.2126 * Double(pixels[i]) + 0.7152 * Double(pixels[i + 1]) + 0.0722 * Double(pixels[i + 2]))
    sum += Double(luminance)
    if luminance > 60 { bright += 1 }
    if luminance > peak { peak = luminance }
  }
  let mean = sum / Double(x1 - x0)
  if abs(mean - previous) > 0.6 || bright > 0 {
    print("\(y)\tmean=\(String(format: "%.1f", mean))\tbright=\(bright)\tmax=\(peak)")
  }
  previous = mean
}
