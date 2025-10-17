#!/usr/bin/env python
"""
dmap2gcode CLI - Command Line Interface for depth map to G-code conversion
Based on dmap2gcode by Scorch
"""

import sys
import os
import argparse
import json
from math import *
from time import time

# Import necessary libraries
try:
    from PIL import Image
    PIL = True
except ImportError:
    print("Error: PIL (Pillow) is required. Install with: pip install Pillow")
    sys.exit(1)

try:
    import numpy
    NUMPY = True
except ImportError:
    NUMPY = False
    print("Warning: NumPy not found. Processing will be slower.")

# Core classes and functions from original dmap2gcode
epsilon = 1e-5

class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def __sub__(self, other):
        return Point(self.x - other.x, self.y - other.y)
    def __add__(self, other):
        return Point(self.x + other.x, self.y + other.y)
    def __mul__(self, other):
        return Point(self.x * other, self.y * other)
    def __rmul__(self, other):
        return Point(self.x * other, self.y * other)
    def cross(self, other):
        return self.x * other.y - self.y * other.x
    def dot(self, other):
        return self.x * other.x + self.y * other.y
    def mag(self):
        return sqrt(self.x**2 + self.y**2)
    def mag2(self):
        return self.x**2 + self.y**2

class Gcode:
    def __init__(self, homeheight = 1.5, safetyheight = 0.04,
                 tolerance=0.001, units="G20", header="", postscript="",
                 target=lambda s: sys.stdout.write(s + "\n"),
                 disable_arcs = False):
        self.lastx = self.lasty = self.lastz = self.lasta = None
        self.lastgcode = self.lastfeed = None
        self.homeheight = homeheight
        self.safetyheight = self.lastz = safetyheight
        self.tolerance = tolerance
        self.units = units
        self.cuts = []
        self.write = target
        self.time = 0
        self.plane = None
        self.header = header
        self.postscript = postscript
        self.disable_arcs = disable_arcs

    def set_plane(self, p):
        if (not self.disable_arcs):
            assert p in (17,18,19)
            if p != self.plane:
                self.plane = p
                self.write("G%d" % p)

    def begin(self):
        if self.header=="":
            self.write("G17 G90 M3 S3000 G40 G94")
        else:
            for line in self.header:
                self.write(line)
        self.write(self.units)
        if not self.disable_arcs:
            self.write("G91.1")
        self.write("G0 Z%.4f" % (self.safetyheight))

    def flush(self):
        if self.lastgcode == "G0":
            self.rapid(self.lastx, self.lasty, self.lastz, self.lasta)
        elif self.lastgcode == "G1":
            self.cut(self.lastx, self.lasty, self.lastz)

    def end(self):
        self.flush()
        self.write("G0 Z%.4f" % (self.safetyheight))
        self.write("G0 X0 Y0")
        if self.postscript=='' or self.postscript=='\n':
            self.write("M5")
            self.write("M2")
        else:
            # Handle postscript as either string or list
            if isinstance(self.postscript, str):
                lines = self.postscript.split("\n")
            else:
                lines = self.postscript
            for line in lines:
                if line != '':
                    self.write(line)

    def rapid(self, x=None, y=None, z=None, a=None):
        self.flush()
        self.move_common(x, y, z, a, "G0")

    def move_common(self, x=None, y=None, z=None, a=None, gcode="G0"):
        if self.cuts:
            self.flush()
            self.cuts = []
        
        if gcode != self.lastgcode:
            self.write(gcode)
            self.lastgcode = gcode
        
        codes = []
        if x != None: codes.append("X%.4f" % (x))
        if y != None: codes.append("Y%.4f" % (y))
        if z != None: codes.append("Z%.4f" % (z))
        if a != None: codes.append("A%.4f" % (a))
        
        if codes:
            self.write(" ".join(codes))
        
        if x != None: self.lastx = x
        if y != None: self.lasty = y
        if z != None: self.lastz = z
        if a != None: self.lasta = a

    def set_feed(self, feed):
        self.write("F%.4f" % (feed))

    def cut(self, x=None, y=None, z=None):
        if self.lastgcode != "G1":
            self.flush()
        self.lastgcode = "G1"
        self.cuts.append([x, y, z])
        self.lastx = x
        self.lasty = y
        self.lastz = z

    def home(self):
        self.flush()
        self.rapid(z=self.homeheight)

    def safety(self):
        self.flush()
        self.rapid(z=self.safetyheight)

def ball_tool(r, rad):
    if rad > r: return 0
    return sqrt(rad**2 - r**2)

def endmill(r, dia, rough_offset=0.0):
    return 0

def vee_common(angle, rough_offset=0.0):
    slope = tan(angle * pi / 180 / 2)
    def f(r, dia):
        return r * slope
    return f

def make_tool_shape(f, wdia, resp, rough_offset=0.0):
    # resp is pixel size
    wrad = wdia/2 + rough_offset
    wpix = int(ceil(wrad/resp))
    res = []
    for y in range(-wpix, wpix+1):
        for x in range(-wpix, wpix+1):
            r = sqrt(x**2 + y**2) * resp
            if r < wrad:
                z = f(r, wrad)
                res.append((x, y, z))
    res.sort(key=lambda item: item[2])
    return ToolShape(res)

class ToolShape:
    def __init__(self, data):
        self.data = data
        self.width = data[-1][0] - data[0][0] + 1
    def __getitem__(self, i):
        return self.data[i]

class Convert_Scan_Alternating:
    def __init__(self):
        self.st = 0
    def __call__(self, primary, items):
        if self.st:
            items.reverse()
        self.st = self.st ^ 1
        return [(True, [items[0]])] + [(False, items[1:])]
    def reset(self):
        self.st = 0

class Convert_Scan_Increasing:
    def __call__(self, primary, items):
        return [(True, [items[0]])] + [(False, items[1:])]
    def reset(self):
        pass

class Convert_Scan_Decreasing:
    def __call__(self, primary, items):
        items.reverse()
        return [(True, [items[0]])] + [(False, items[1:])]
    def reset(self):
        pass

class Reduce_Scan_Lace:
    def __init__(self, converter, slope, keep):
        self.converter = converter
        self.slope = slope
        self.keep = keep
    def __call__(self, primary, items):
        slope = self.slope
        keep = self.keep
        def bos(j):
            return j % keep == 0
        def eos(j):
            return (j+1) % keep == 0
        
        for i, (flag, points) in enumerate(self.converter(primary, items)):
            if flag and i == 0:
                yield True, points
            else:
                for j, p in enumerate(points):
                    if bos(j):
                        if i == 0: yield True, [p]
                        else: yield False, [p]
                    elif eos(j):
                        yield False, [p]
    def reset(self):
        self.converter.reset()

# Image matrix classes
if NUMPY:
    class Image_Matrix:
        def __init__(self, width=2, height=2):
            self.width = width
            self.height = height
            self.matrix = numpy.zeros((width, height), 'float32')
            self.shape = [width, height]
            self.t_offset = 0

        def __call__(self, i, j):
            return self.matrix[i+self.t_offset, j+self.t_offset]

        def FromImage(self, im, pil_format=True):
            if pil_format:
                him, wim = im.size
                self.matrix = numpy.zeros((wim, him), 'float32')
                for i in range(0, wim):
                    for j in range(0, him):
                        pix = im.getpixel((j, i))
                        self.matrix[i, j] = float(pix)
            self.width = wim
            self.height = him
            self.shape = [wim, him]
            self.t_offset = 0

        def pad_w_zeros(self, tool):
            ts = tool.width
            new_w = self.width + ts
            new_h = self.height + ts
            new_mat = numpy.ones((new_w, new_h), 'float32') * -1e10
            new_mat[ts//2:ts//2+self.width, ts//2:ts//2+self.height] = self.matrix
            self.matrix = new_mat
            self.width = new_w
            self.height = new_h
            self.shape = [new_w, new_h]
            self.t_offset = ts//2

        def height_calc(self, x, y, tool):
            m1 = self.t_offset
            d_pix = tool.data
            max_z = -1e10
            for dx, dy, dz in d_pix:
                tx = x + dx + m1
                ty = y + dy + m1
                if 0 <= tx < self.width and 0 <= ty < self.height:
                    z = self.matrix[tx, ty] + dz
                    max_z = max(max_z, z)
            return max_z

        def min(self):
            return self.matrix.min()

        def max(self):
            return self.matrix.max()

        def mult(self, val):
            self.matrix = self.matrix * val

        def minus(self, val):
            self.matrix = self.matrix - val

else:
    # Fallback for non-numpy implementation
    class Image_Matrix:
        def __init__(self, width=0, height=0):
            self.width = width
            self.height = height
            self.matrix = []
            self.shape = [width, height]

        def __call__(self, i, j):
            return self.matrix[i][j]

        def FromImage(self, im, pil_format=True):
            self.matrix = []
            if pil_format:
                him, wim = im.size
                for i in range(0, wim):
                    row = []
                    for j in range(0, him):
                        pix = im.getpixel((j, i))
                        row.append(float(pix))
                    self.matrix.append(row)
            self.width = wim
            self.height = him
            self.shape = [wim, him]
            self.t_offset = 0

        def pad_w_zeros(self, tool):
            ts = tool.width
            for i in range(len(self.matrix), self.width+ts):
                self.matrix.append([])
            for i in range(0, len(self.matrix)):
                for j in range(len(self.matrix[i]), self.height+ts):
                    self.matrix[i].append(-1e10)

        def height_calc(self, x, y, tool):
            max_z = -1e10
            for dx, dy, dz in tool.data:
                tx = x + dx
                ty = y + dy
                if 0 <= tx < self.width and 0 <= ty < self.height:
                    z = self.matrix[tx][ty] + dz
                    max_z = max(max_z, z)
            return max_z

        def min(self):
            min_val = float('inf')
            for row in self.matrix:
                for val in row:
                    min_val = min(min_val, val)
            return min_val

        def max(self):
            max_val = float('-inf')
            for row in self.matrix:
                for val in row:
                    max_val = max(max_val, val)
            return max_val

        def mult(self, val):
            for i in range(len(self.matrix)):
                for j in range(len(self.matrix[i])):
                    self.matrix[i][j] *= val

        def minus(self, val):
            for i in range(len(self.matrix)):
                for j in range(len(self.matrix[i])):
                    self.matrix[i][j] -= val

class Converter:
    def __init__(self, image, units, tool_shape, pixelsize, pixelstep, safetyheight, tolerance,
                 feed, convert_rows, convert_cols, cols_first_flag, border, entry_cut,
                 roughing_delta, roughing_feed, xoffset, yoffset, splitstep, header,
                 postscript, edge_offset, disable_arcs):
        self.image = image
        self.units = units
        self.tool_shape = tool_shape
        self.pixelsize = pixelsize
        self.safetyheight = safetyheight
        self.tolerance = tolerance
        self.base_feed = feed
        self.convert_rows = convert_rows
        self.convert_cols = convert_cols
        self.cols_first_flag = cols_first_flag
        self.entry_cut = entry_cut
        self.roughing_delta = roughing_delta
        self.roughing_feed = roughing_feed
        self.header = header
        self.postscript = postscript
        self.border = border
        self.edge_offset = edge_offset
        self.disable_arcs = disable_arcs
        self.xoffset = xoffset
        self.yoffset = yoffset

        # Split step stuff
        splitpixels = 0
        if splitstep > epsilon:
            pixelstep = int(floor(pixelstep * splitstep * 2))
            splitpixels = int(floor(pixelstep * splitstep))
        self.pixelstep = pixelstep
        self.splitpixels = splitpixels

        self.cache = {}
        w, h = self.w, self.h = image.shape
        self.h1 = h
        self.w1 = w

    def one_pass(self):
        g = self.g
        g.set_feed(self.feed)

        if self.convert_cols and self.cols_first_flag:
            self.g.set_plane(19)
            self.mill_cols(self.convert_cols, True)
            if self.convert_rows: g.safety()

        if self.convert_rows:
            self.g.set_plane(18)
            self.mill_rows(self.convert_rows, not self.cols_first_flag)

        if self.convert_cols and not self.cols_first_flag:
            self.g.set_plane(19)
            if self.convert_rows: g.safety()
            self.mill_cols(self.convert_cols, not self.convert_rows)

        g.safety()

        if self.convert_cols:
            self.convert_cols.reset()
        if self.convert_rows:
            self.convert_rows.reset()

        step_save = self.pixelstep
        self.pixelstep = max(self.w1, self.h1) + 1
        if self.border == 1 and not self.convert_rows:
            if self.convert_cols:
                self.g.set_plane(18)
                self.mill_rows(self.convert_cols, True, border_flag=True)
                g.safety()

        if self.border == 1 and not self.convert_cols:
            if self.convert_rows:
                self.g.set_plane(19)
                self.mill_cols(self.convert_rows, True, border_flag=True)
                g.safety()
        self.pixelstep = step_save

        if self.convert_cols:
            self.convert_cols.reset()
        if self.convert_rows:
            self.convert_rows.reset()

        g.safety()

    def convert(self):
        output_gcode = []
        self.g = g = Gcode(safetyheight=self.safetyheight,
                           tolerance=self.tolerance,
                           units=self.units,
                           header=self.header,
                           postscript=self.postscript,
                           target=lambda s: output_gcode.append(s),
                           disable_arcs=self.disable_arcs)
        g.begin()
        g.safety()

        if self.roughing_delta:
            self.feed = self.roughing_feed
            r = -self.roughing_delta
            m = self.image.min()
            while r > m:
                self.rd = r
                self.one_pass()
                r = r - self.roughing_delta
            if r < m + epsilon:
                self.rd = m
                self.one_pass()
        else:
            self.feed = self.base_feed
            self.rd = self.image.min()
            self.one_pass()

        g.end()
        return output_gcode

    def get_z(self, x, y):
        try:
            return min(0, max(self.rd, self.cache[x, y]))
        except KeyError:
            self.cache[x, y] = d = self.image.height_calc(x, y, self.tool_shape)
            return min(0.0, max(self.rd, d))

    def get_dz_dy(self, x, y):
        y1 = max(0, y-1)
        y2 = min(self.image.shape[0]-1, y+1)
        dy = self.pixelsize * (y2-y1)
        return (self.get_z(x, y2) - self.get_z(x, y1)) / dy

    def get_dz_dx(self, x, y):
        x1 = max(0, x-1)
        x2 = min(self.image.shape[1]-1, x+1)
        dx = self.pixelsize * (x2-x1)
        return (self.get_z(x2, y) - self.get_z(x1, y)) / dx

    def frange(self, start, stop, step):
        out = []
        i = start
        while i < stop:
            out.append(i)
            i += step
        return out

    def mill_rows(self, convert_scan, primary, border_flag=False):
        w1 = self.w1
        h1 = self.h1
        pixelsize = self.pixelsize
        pixelstep = self.pixelstep
        pixel_offset = int(ceil(self.edge_offset / pixelsize))
        jrange = self.frange(self.splitpixels+pixel_offset, w1-pixel_offset, pixelstep)
        if jrange[0] != pixel_offset: jrange.insert(0, pixel_offset)
        if w1-1-pixel_offset not in jrange: jrange.append(w1-1-pixel_offset)

        irange = range(pixel_offset, h1-pixel_offset)

        for j in jrange:
            y = (w1-j-1) * pixelsize + self.yoffset
            scan = []
            for i in irange:
                x = i * pixelsize + self.xoffset
                milldata = (i, (x, y, self.get_z(i, j)),
                            self.get_dz_dx(i, j), self.get_dz_dy(i, j))
                scan.append(milldata)
            for flag, points in convert_scan(primary, scan):
                if flag or border_flag:
                    self.entry_cut(self, points[0][0], j, points)
                for p in points:
                    self.g.cut(*p[1])
            self.g.flush()

    def mill_cols(self, convert_scan, primary, border_flag=False):
        w1 = self.w1
        h1 = self.h1
        pixelsize = self.pixelsize
        pixelstep = self.pixelstep
        pixel_offset = int(ceil(self.edge_offset / pixelsize))
        jrange = self.frange(self.splitpixels+pixel_offset, h1-pixel_offset, pixelstep)
        if jrange[0] != pixel_offset: jrange.insert(0, pixel_offset)
        if h1-1-pixel_offset not in jrange: jrange.append(h1-1-pixel_offset)

        irange = range(pixel_offset, w1-pixel_offset)
        if h1-1-pixel_offset not in jrange: jrange.append(h1-1-pixel_offset)
        jrange.reverse()

        for j in jrange:
            x = j * pixelsize + self.xoffset
            scan = []
            for i in irange:
                y = (w1-i-1) * pixelsize + self.yoffset
                milldata = (i, (x, y, self.get_z(j, i)),
                            self.get_dz_dy(j, i), self.get_dz_dx(j, i))
                scan.append(milldata)
            for flag, points in convert_scan(primary, scan):
                if flag or border_flag:
                    self.entry_cut(self, j, points[0][0], points)
                for p in points:
                    self.g.cut(*p[1])
            self.g.flush()

class SimpleEntryCut:
    def __init__(self, feed):
        self.feed = feed

    def __call__(self, conv, i0, j0, points):
        x, y, z = points[0][1]
        conv.g.flush()
        conv.g.safety()
        conv.g.rapid(x, y)
        conv.g.set_feed(self.feed)
        conv.g.cut(z=z)
        conv.g.set_feed(conv.feed)

# CLI Functions
def convert_image_to_gcode(image_path, config):
    """Main conversion function"""
    
    # Load image
    try:
        pil_im = Image.open(image_path)
        # Convert to grayscale
        if pil_im.mode == "I" or pil_im.mode == "F":
            pil_im = pil_im.convert("F")
            pil_im = pil_im.point(lambda x: x * (1.0 / 256.0))
        else:
            pil_im = pil_im.convert("L")
    except Exception as e:
        raise Exception(f"Failed to load image: {e}")

    # Create image matrix
    MAT = Image_Matrix()
    MAT.FromImage(pil_im)

    # Calculate dimensions
    image_h = float(config['yscale'])
    pixel_size = image_h / (float(MAT.width) - 1.0)
    image_w = pixel_size * (float(MAT.height) - 1.0)
    
    # Setup parameters
    tolerance = float(config.get('tolerance', 0.001))
    safe_z = float(config.get('z_safe', 0.25))
    depth = -float(config.get('z_cut', 0.25))
    tool_diameter = float(config.get('tool_diameter', 0.25))
    feed_rate = float(config.get('feed_rate', 100))
    plunge_feed = float(config.get('plunge_feed', 25))
    step = max(1, int(floor(float(config.get('stepover', 0.1)) / pixel_size)))
    
    # Tool setup
    tool_type = config.get('tool', 'ball')
    if tool_type == 'flat':
        TOOL = make_tool_shape(endmill, tool_diameter, pixel_size)
    elif tool_type == 'v':
        v_angle = float(config.get('v_angle', 45))
        TOOL = make_tool_shape(vee_common(v_angle), tool_diameter, pixel_size)
    else:  # ball
        TOOL = make_tool_shape(ball_tool, tool_diameter, pixel_size)

    # Scan pattern setup
    rows = config.get('scan_pattern', 'rows') != 'columns'
    columns = config.get('scan_pattern', 'rows') != 'rows'
    columns_first = config.get('scan_pattern', 'rows') == 'columns_first'

    # Converter setup
    scan_dir = config.get('scan_direction', 'alternating')
    convert_makers = {
        'positive': Convert_Scan_Increasing,
        'negative': Convert_Scan_Decreasing,
        'alternating': Convert_Scan_Alternating
    }
    
    convert_rows = convert_makers[scan_dir]() if rows else None
    convert_cols = convert_makers[scan_dir]() if columns else None

    # Header and units
    units = 'G20' if config.get('units', 'in') == 'in' else 'G21'
    header = []
    header.append(f"(Generated by dmap2gcode_cli)")
    header.append(f"(Image: {os.path.basename(image_path)})")
    
    # Handle header - can be string or list
    header_config = config.get('header', 'G17 G90 G64 P0.001 M3 S3000')
    if isinstance(header_config, str):
        header.extend(header_config.split('|'))
    else:
        header.extend(header_config)
    
    # Handle postscript - can be string or already formatted
    postscript_config = config.get('postscript', 'M5|M2')
    if isinstance(postscript_config, str):
        postscript = postscript_config.replace('|', '\n')
    else:
        postscript = postscript_config

    # Normalize or scale image
    if config.get('normalize', True):
        a = MAT.min()
        b = MAT.max()
        if a != b:
            MAT.minus(a)
            MAT.mult(1./(b-a))
    else:
        MAT.mult(1/255.0)

    MAT.mult(depth)

    # Origin calculation
    origin = config.get('origin', 'default')
    minx = 0
    maxx = image_w
    miny = 0
    maxy = image_h
    midx = (minx + maxx)/2
    midy = (miny + maxy)/2

    if origin == 'top-left':
        x_zero, y_zero = minx, maxy
    elif origin == 'top-center':
        x_zero, y_zero = midx, maxy
    elif origin == 'top-right':
        x_zero, y_zero = maxx, maxy
    elif origin == 'center':
        x_zero, y_zero = midx, midy
    elif origin == 'bottom-left':
        x_zero, y_zero = minx, miny
    elif origin == 'bottom-center':
        x_zero, y_zero = midx, miny
    elif origin == 'bottom-right':
        x_zero, y_zero = maxx, miny
    else:  # default
        x_zero, y_zero = 0, 0

    xoffset = -x_zero
    yoffset = -y_zero

    # Invert if needed
    if config.get('invert', False):
        MAT.mult(-1.0)
    else:
        MAT.minus(depth)

    # Pad matrix
    MAT.pad_w_zeros(TOOL)

    # Entry cut
    entry_cut = SimpleEntryCut(plunge_feed)

    # Run conversion
    converter = Converter(
        MAT, units, TOOL, pixel_size, step, safe_z, tolerance,
        feed_rate, convert_rows, convert_cols, columns_first,
        config.get('cut_perimeter', False), entry_cut, 0, 0,
        xoffset, yoffset, 0, header, postscript, 0,
        config.get('disable_arcs', False)
    )

    return converter.convert()

def main():
    parser = argparse.ArgumentParser(description='Convert depth map images to G-code')
    parser.add_argument('image', help='Input image file path')
    parser.add_argument('-o', '--output', help='Output G-code file path')
    parser.add_argument('-c', '--config', help='JSON config file path')
    parser.add_argument('--yscale', type=float, default=1.0, help='Image height scale (default: 1.0)')
    parser.add_argument('--z-safe', type=float, default=0.25, help='Safe Z height (default: 0.25)')
    parser.add_argument('--z-cut', type=float, default=0.25, help='Cut depth (default: 0.25)')
    parser.add_argument('--tool', choices=['ball', 'flat', 'v'], default='ball', help='Tool type')
    parser.add_argument('--tool-diameter', type=float, default=0.25, help='Tool diameter')
    parser.add_argument('--v-angle', type=float, default=45, help='V-bit angle (for V tool)')
    parser.add_argument('--feed-rate', type=float, default=100, help='Feed rate')
    parser.add_argument('--plunge-feed', type=float, default=25, help='Plunge feed rate')
    parser.add_argument('--stepover', type=float, default=0.1, help='Stepover distance')
    parser.add_argument('--units', choices=['in', 'mm'], default='in', help='Units (in or mm)')
    parser.add_argument('--origin', default='default', help='Origin position')
    parser.add_argument('--invert', action='store_true', help='Invert depth map')
    parser.add_argument('--normalize', action='store_true', default=True, help='Normalize depth values')
    parser.add_argument('--scan-pattern', choices=['rows', 'columns', 'both'], default='rows')
    parser.add_argument('--scan-direction', choices=['alternating', 'positive', 'negative'], default='alternating')
    parser.add_argument('--disable-arcs', action='store_true', help='Disable arc moves')
    parser.add_argument('--json', action='store_true', help='Output JSON instead of G-code')

    args = parser.parse_args()

    # Build config
    config = {
        'yscale': args.yscale,
        'z_safe': args.z_safe,
        'z_cut': args.z_cut,
        'tool': args.tool,
        'tool_diameter': args.tool_diameter,
        'v_angle': args.v_angle,
        'feed_rate': args.feed_rate,
        'plunge_feed': args.plunge_feed,
        'stepover': args.stepover,
        'units': args.units,
        'origin': args.origin,
        'invert': args.invert,
        'normalize': args.normalize,
        'scan_pattern': args.scan_pattern,
        'scan_direction': args.scan_direction,
        'disable_arcs': args.disable_arcs
    }

    # Load config file if provided
    if args.config:
        try:
            with open(args.config, 'r') as f:
                file_config = json.load(f)
                config.update(file_config)
        except Exception as e:
            print(f"Error loading config file: {e}", file=sys.stderr)
            sys.exit(1)

    # Convert image to G-code
    try:
        gcode = convert_image_to_gcode(args.image, config)
        
        if args.json:
            # Output as JSON for Node.js integration
            output = {
                'success': True,
                'gcode': gcode,
                'config': config
            }
            print(json.dumps(output))
        else:
            # Output G-code
            if args.output:
                with open(args.output, 'w') as f:
                    for line in gcode:
                        f.write(line + '\n')
                print(f"G-code written to {args.output}")
            else:
                for line in gcode:
                    print(line)
                    
    except Exception as e:
        if args.json:
            output = {
                'success': False,
                'error': str(e)
            }
            print(json.dumps(output))
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main() 