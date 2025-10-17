#!/usr/bin/env python3

"""
write_gcode.py

Extracted WriteGCode function and dependencies from dmap2gcode.py
This library contains the core G-code generation functionality.
"""

import sys
import os
import operator
from math import *
from time import time


# Constants
version = '0.13'
VERSION = sys.version_info[0]

if VERSION == 3:
    MAXINT = sys.maxsize
else:
    MAXINT = sys.maxint

# Global variables
QUIET = False
STOP_CALC = 0
IN_AXIS = "AXIS_PROGRESS_BAR" in os.environ

# Check for PIL support
PIL = True
try:
    from PIL import Image
    # from PIL import ImageTk
    # from PIL import ImageOps
    try:
        Image.LANCZOS
    except:
        Image.LANCZOS = Image.ANTIALIAS
except:
    PIL = False

# Check for NumPy support
NUMPY = True
try:
    import numpy.core
    olderr = numpy.core.seterr(divide='ignore')
    plus_inf = (numpy.array((1.,))/0.)[0]
    numpy.core.seterr(**olderr)
except:
    try:
        import numarray, numarray.ieeespecial
        plus_inf = numarray.ieeespecial.inf
    except:
        NUMPY = False

epsilon = 1e-5

# =============================================================================
# Utility Functions
# =============================================================================

def fmessage(text, newline=True):
    """Output messages to console unless QUIET is enabled"""
    global IN_AXIS, QUIET
    if (not IN_AXIS and not QUIET):
        if newline == True:
            try:
                sys.stdout.write(text)
                sys.stdout.write("\n")
            except:
                pass
        else:
            try:
                sys.stdout.write(text)
            except:
                pass

# def progress(a, b, START_TIME, GUI=[]):
#     """Show progress information"""
#     if IN_AXIS:
#         print >> sys.stderr, "FILTER_PROGRESS=%d" % int(a*100./b)
#         sys.stderr.flush()
#     else:
#         CUR_PCT = (a*100./b)
#         if CUR_PCT > 100.0:
#             CUR_PCT = 100.0
#         MIN_REMAIN = (time()-START_TIME)/60 * (100-CUR_PCT)/CUR_PCT
#         MIN_TOTAL = 100.0/CUR_PCT * (time()-START_TIME)/60
#         message = '%.1f %% ( %.1f Minutes Remaining | %.1f Minutes Total )' % (CUR_PCT, MIN_REMAIN, MIN_TOTAL)
#         try:   
#             GUI.statusMessage.set(message)
#         except:
#             fmessage(message)

# =============================================================================
# Geometry Classes and Functions
# =============================================================================

class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    
    def __str__(self): 
        return "<%f,%f>" % (self.x, self.y)
    
    def __sub__(self, other):
        return Point(self.x - other.x, self.y - other.y)
    
    def __add__(self, other):
        return Point(self.x + other.x, self.y + other.y)
    
    def __mul__(self, other):
        return Point(self.x * other, self.y * other)
    
    __rmul__ = __mul__
    
    def cross(self, other):
        return self.x * other.y - self.y * other.x
    
    def dot(self, other):
        return self.x * other.x + self.y * other.y
    
    def mag(self):
        return hypot(self.x, self.y)
    
    def mag2(self):
        return self.x**2 + self.y**2

def dist_lseg(l1, l2, p):
    """Calculate distance from point p to line segment l1-l2"""
    x0, y0, z0 = l1
    xa, ya, za = l2
    xi, yi, zi = p

    dx = xa-x0
    dy = ya-y0
    dz = za-z0
    d2 = dx*dx + dy*dy + dz*dz

    if d2 == 0: return 0

    t = (dx * (xi-x0) + dy * (yi-y0) + dz * (zi-z0)) / d2
    if t < 0: t = 0
    if t > 1: t = 1
    dist2 = (xi - x0 - t*dx)**2 + (yi - y0 - t*dy)**2 + (zi - z0 - t*dz)**2

    return dist2 ** .5

def rad1(x1, y1, x2, y2, x3, y3):
    """Calculate radius for three points"""
    x12 = x1-x2
    y12 = y1-y2
    x23 = x2-x3
    y23 = y2-y3
    x31 = x3-x1
    y31 = y3-y1

    den = abs(x12 * y23 - x23 * y12)
    if abs(den) < 1e-5: return MAXINT
    return hypot(float(x12), float(y12)) * hypot(float(x23), float(y23)) * hypot(float(x31), float(y31)) / 2 / den

def cent1(x1, y1, x2, y2, x3, y3):
    """Calculate center point for arc through three points"""
    P1 = Point(x1, y1)
    P2 = Point(x2, y2)
    P3 = Point(x3, y3)

    den = abs((P1-P2).cross(P2-P3))
    if abs(den) < 1e-5: return MAXINT, MAXINT

    alpha = (P2-P3).mag2() * (P1-P2).dot(P1-P3) / 2 / den / den
    beta  = (P1-P3).mag2() * (P2-P1).dot(P2-P3) / 2 / den / den
    gamma = (P1-P2).mag2() * (P3-P1).dot(P3-P2) / 2 / den / den

    Pc = alpha * P1 + beta * P2 + gamma * P3
    return Pc.x, Pc.y

def arc_center(plane, p1, p2, p3):
    """Get arc center for specified plane"""
    x1, y1, z1 = p1
    x2, y2, z2 = p2
    x3, y3, z3 = p3

    if plane == 17: return cent1(x1, y1, x2, y2, x3, y3)
    if plane == 18: return cent1(x1, z1, x2, z2, x3, z3)
    if plane == 19: return cent1(y1, z1, y2, z2, y3, z3)

def arc_rad(plane, P1, P2, P3):
    """Calculate arc radius for specified plane"""
    if plane is None: return MAXINT

    x1, y1, z1 = P1
    x2, y2, z2 = P2
    x3, y3, z3 = P3

    if plane == 17: return rad1(x1, y1, x2, y2, x3, y3)
    if plane == 18: return rad1(x1, z1, x2, z2, x3, z3)
    if plane == 19: return rad1(y1, z1, y2, z2, y3, z3)
    return None, 0

def get_pts(plane, x, y, z):
    """Get points for specified plane"""
    if plane == 17: return x, y
    if plane == 18: return x, z
    if plane == 19: return y, z

def one_quadrant(plane, c, p1, p2, p3):
    """Check if arc is within one quadrant"""
    xc, yc = c
    x1, y1 = get_pts(plane, p1[0], p1[1], p1[2])
    x2, y2 = get_pts(plane, p2[0], p2[1], p2[2])
    x3, y3 = get_pts(plane, p3[0], p3[1], p3[2])

    def sign(x):
        if abs(x) < 1e-5: return 0
        if x < 0: return -1
        return 1

    signs = set((
        (sign(x1-xc), sign(y1-yc)),
        (sign(x2-xc), sign(y2-yc)),
        (sign(x3-xc), sign(y3-yc))
    ))

    if len(signs) == 1: return True

    if (1, 1) in signs:
        signs.discard((1, 0))
        signs.discard((0, 1))
    if (1, -1) in signs:
        signs.discard((1, 0))
        signs.discard((0, -1))
    if (-1, 1) in signs:
        signs.discard((-1, 0))
        signs.discard((0, 1))
    if (-1, -1) in signs:
        signs.discard((-1, 0))
        signs.discard((0, -1))

    if len(signs) == 1: return True

def arc_dir(plane, c, p1, p2, p3):
    """Determine arc direction"""
    xc, yc = c
    x1, y1 = get_pts(plane, p1[0], p1[1], p1[2])
    x2, y2 = get_pts(plane, p2[0], p2[1], p2[2])
    x3, y3 = get_pts(plane, p3[0], p3[1], p3[2])

    theta_start = atan2(y1-yc, x1-xc)
    theta_mid = atan2(y2-yc, x2-xc)
    theta_end = atan2(y3-yc, x3-xc)

    if theta_mid < theta_start:
        theta_mid = theta_mid + 2 * pi
    while theta_end < theta_mid:
        theta_end = theta_end + 2 * pi

    return theta_end < 2 * pi

def arc_fmt(plane, c1, c2, p1):
    """Format arc parameters"""
    x, y, z = p1
    if plane == 17: return "I%.4f J%.4f" % (c1-x, c2-y)
    if plane == 18: return "I%.4f K%.4f" % (c1-x, c2-z)
    if plane == 19: return "J%.4f K%.4f" % (c1-y, c2-z)

def douglas(st, tolerance=.001, plane=None, _first=True):
    """Douglas-Peucker path simplification algorithm"""
    if len(st) == 1:
        yield "G1", st[0], None
        return

    l1 = st[0]
    l2 = st[-1]

    worst_dist = 0
    worst = 0
    min_rad = MAXINT
    max_arc = -1

    ps = st[0]
    pe = st[-1]

    for i, p in enumerate(st):
        if p is l1 or p is l2: continue
        dist = dist_lseg(l1, l2, p)
        if dist > worst_dist:
            worst = i
            worst_dist = dist
            rad = arc_rad(plane, ps, p, pe)
            if rad < min_rad:
                max_arc = i
                min_rad = rad

    worst_arc_dist = 0
    if min_rad != MAXINT:
        c1, c2 = arc_center(plane, ps, st[max_arc], pe)
        lx, ly, lz = st[0]
        if one_quadrant(plane, (c1, c2), ps, st[max_arc], pe):
            for i, (x, y, z) in enumerate(st):
                if plane == 17: dist = abs(hypot(c1-x, c2-y) - min_rad)
                elif plane == 18: dist = abs(hypot(c1-x, c2-z) - min_rad)
                elif plane == 19: dist = abs(hypot(c1-y, c2-z) - min_rad)
                else: dist = MAXINT
                if dist > worst_arc_dist: worst_arc_dist = dist

                mx = (x+lx)/2
                my = (y+ly)/2
                mz = (z+lz)/2
                if plane == 17: dist = abs(hypot(c1-mx, c2-my) - min_rad)
                elif plane == 18: dist = abs(hypot(c1-mx, c2-mz) - min_rad)
                elif plane == 19: dist = abs(hypot(c1-my, c2-mz) - min_rad)
                else: dist = MAXINT
                lx, ly, lz = x, y, z
        else:
            worst_arc_dist = MAXINT
    else:
        worst_arc_dist = MAXINT

    if worst_arc_dist < tolerance and worst_arc_dist < worst_dist:
        ccw = arc_dir(plane, (c1, c2), ps, st[max_arc], pe)
        if plane == 18: ccw = not ccw
        yield "G1", ps, None
        if ccw:
            yield "G3", st[-1], arc_fmt(plane, c1, c2, ps)
        else:
            yield "G2", st[-1], arc_fmt(plane, c1, c2, ps)
    elif worst_dist > tolerance:
        if _first: yield "G1", st[0], None
        for i in douglas(st[:worst+1], tolerance, plane, False):
            yield i
        yield "G1", st[worst], None
        for i in douglas(st[worst:], tolerance, plane, False):
            yield i
        if _first: yield "G1", st[-1], None
    else:
        if _first: yield "G1", st[0], None
        if _first: yield "G1", st[-1], None

# =============================================================================
# G-code Generation Class
# =============================================================================

class Gcode:
    """Class for creating G-code files"""
    def __init__(self, homeheight=1.5, safetyheight=0.04,
                 tolerance=0.001, units="G20", header="", postscript="",
                 target=lambda s: sys.stdout.write(s + "\n"),
                 disable_arcs=False):
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
        """Set the working plane"""
        if (not self.disable_arcs):
            assert p in (17, 18, 19)
            if p != self.plane:
                self.plane = p
                self.write("G%d" % p)
        
    def begin(self):
        """Begin the G-code program"""
        if self.header == "":
            self.write("G17 G90 M3 S3000 G40 G94")
        else:
            for line in self.header:
                self.write(line)
        self.write(self.units)
        if not self.disable_arcs:
            self.write("G91.1")
        self.write("G0 Z%.4f" % (self.safetyheight))
        
    def flush(self):
        """Flush any pending cut moves"""
        if not self.cuts: return
        for move, (x, y, z), cent in douglas(self.cuts, self.tolerance, self.plane):
            if cent:
                self.write("%s X%.4f Y%.4f Z%.4f %s" % (move, x, y, z, cent))
                self.lastgcode = None
                self.lastx = x
                self.lasty = y
                self.lastz = z
            else:
                self.move_common(x, y, z, gcode="G1")
        self.cuts = []

    def end(self):
        """End the G-code program"""
        self.flush()
        self.safety()
        if self.postscript == "":
            self.write("M2")
        else:
            self.write(self.postscript)

    def rapid(self, x=None, y=None, z=None, a=None):
        """Perform a rapid move"""
        self.flush()
        self.move_common(x, y, z, a, "G0")

    def move_common(self, x=None, y=None, z=None, a=None, gcode="G0"):
        """Internal function for G0 and G1 moves"""
        gcodestring = xstring = ystring = zstring = astring = ""
        if x == None: x = self.lastx
        if y == None: y = self.lasty
        if z == None: z = self.lastz
        if a == None: a = self.lasta

        if x != self.lastx:
                xstring = " X%.4f" % (x)
                self.lastx = x
        if y != self.lasty:
                ystring = " Y%.4f" % (y)
                self.lasty = y
        if z != self.lastz:
                zstring = " Z%.4f" % (z)
                self.lastz = z
        if a != self.lasta:
                astring = " A%.4f" % (a)
                self.lasta = a
        if xstring == ystring == zstring == astring == "":
            return

        if(gcode != self.lastgcode and self.lastgcode == "G0"):
            cmd_temp = "".join(["G0", xstring, ystring, " Z10.0", astring])
            self.write(cmd_temp)

        if gcode != self.lastgcode:
                gcodestring = gcode
                self.lastgcode = gcode
        cmd = "".join([gcodestring, xstring, ystring, zstring, astring])
        if cmd:
            self.write(cmd)

    def set_feed(self, feed):
        """Set the feed rate"""
        self.flush()
        self.write("F%.4f" % feed)

    def cut(self, x=None, y=None, z=None):
        """Perform a cutting move"""
        if(z > -0.01):
            # print(f"Skipping {x}, {y}, {z}")
            return
        if self.cuts:
            lastx, lasty, lastz = self.cuts[-1]
        else:
            lastx, lasty, lastz = self.lastx, self.lasty, self.lastz
        if x is None: x = lastx
        if y is None: y = lasty
        if z is None: z = lastz
        self.cuts.append([x, y, z])

    def home(self):
        """Go to home height"""
        self.flush()
        self.rapid(z=self.homeheight)

    def safety(self):
        """Go to safety height"""
        self.flush()
        self.rapid(z=self.safetyheight)

# =============================================================================
# Tool Shape Functions
# =============================================================================

def ball_tool(r, rad):
    """Ball end mill tool shape"""
    s = -sqrt(rad**2-r**2)
    return s

def endmill(r, dia, rough_offset=0.0):
    """End mill tool shape"""
    return 0

def vee_common(angle, rough_offset=0.0):
    """V-bit tool shape"""
    slope = tan(pi/2.0 - (angle / 2.0) * pi / 180.0)
    def f(r, dia):
        return r * slope
    return f

def amax(seq):
    """Find maximum absolute value in sequence"""
    res = 0
    for i in seq:
        if abs(i) > abs(res): res = i
    return res

def group_by_sign(seq, slop=sin(pi/18), key=lambda x:x):
    """Group consecutive items by sign"""
    if not seq: return
    
    sign_of = lambda x: 1 if key(x) > slop else -1 if key(x) < -slop else 0
    last_sign = sign_of(seq[0])
    group = [seq[0]]
    
    for item in seq[1:]:
        current_sign = sign_of(item)
        if current_sign == last_sign or current_sign == 0:
            group.append(item)
        else:
            yield group
            group = [item]
            last_sign = current_sign
    
    if group:
        yield group

def make_tool_shape(f, wdia, resp, rough_offset=0.0):
    """Create a tool shape matrix"""
    res = 1. / resp
    wrad = wdia/2.0 + rough_offset
    rad = int(ceil((wrad-resp/2.0)*res))
    if rad < 1: rad = 1
    dia = 2*rad+1
    
    hdia = rad
    l = []
    for x in range(dia):
        for y in range(dia):
            r = hypot(x-hdia, y-hdia) * resp
            if r < wrad:
                z = f(r, wrad)
                l.append(z)
    
    TOOL = Image_Matrix(dia, dia)
    l = []
    temp = []
    for x in range(dia):
        temp.append([])
        for y in range(dia):
            r = hypot(x-hdia, y-hdia) * resp
            if r < wrad:
                z = f(r, wrad)
                l.append(z)
                temp[x].append(float(z))
            else:
                temp[x].append(1e100000)
    TOOL.From_List(temp)
    TOOL.minus(TOOL.min()+rough_offset)
    return TOOL

# =============================================================================
# Scan Converter Classes
# =============================================================================

class Convert_Scan_Alternating:
    """Alternating scan direction converter"""
    def __init__(self):
        self.st = 0

    def __call__(self, primary, items):
        st = self.st = self.st + 1
        if st % 2: items.reverse()
        if st == 1: yield True, items
        else: yield False, items

    def reset(self):
        self.st = 0

class Convert_Scan_Increasing:
    """Increasing scan direction converter"""
    def __call__(self, primary, items):
        yield True, items

    def reset(self):
        pass

class Convert_Scan_Decreasing:
    """Decreasing scan direction converter"""
    def __call__(self, primary, items):
        items.reverse()
        yield True, items

    def reset(self):
        pass

class Convert_Scan_Upmill:
    """Upmill scan converter"""
    def __init__(self, slop=sin(pi / 18)):
        self.slop = slop

    def __call__(self, primary, items):
        for span in group_by_sign(items, self.slop, operator.itemgetter(2)):
            if amax([it[2] for it in span]) < 0:
                span.reverse()
            yield True, span

    def reset(self):
        pass

class Convert_Scan_Downmill:
    """Downmill scan converter"""
    def __init__(self, slop=sin(pi / 18)):
        self.slop = slop

    def __call__(self, primary, items):
        for span in group_by_sign(items, self.slop, operator.itemgetter(2)):
            if amax([it[2] for it in span]) > 0:
                span.reverse()
            yield True, span

    def reset(self):
        pass

class Reduce_Scan_Lace:
    """Lace pattern scan reducer"""
    def __init__(self, converter, slope, keep):
        self.converter = converter
        self.slope = slope
        self.keep = keep

    def __call__(self, primary, items):
        slope = self.slope
        keep = self.keep
        if primary:
            idx = 3
            test = operator.le
        else:
            idx = 2
            test = operator.ge

        def bos(j):
            return j - j % keep

        def eos(j):
            if j % keep == 0: return j
            return j + keep - j%keep

        for i, (flag, span) in enumerate(self.converter(primary, items)):
            subspan = []
            a = None
            for i, si in enumerate(span):
                ki = si[idx]
                if a is None:
                    if test(abs(ki), slope):
                        a = b = i
                else:
                    if test(abs(ki), slope):
                        b = i
                    else:
                        if i - b < keep: continue
                        yield True, span[bos(a):eos(b+1)]
                        a = None
            if a is not None:
                yield True, span[a:]

    def reset(self):
        self.converter.reset()

class Reduce_Scan_Lace_new:
    """New lace pattern scan reducer"""
    def __init__(self, converter, depth, keep):
        self.converter = converter
        self.depth = depth
        self.keep = keep

    def __call__(self, primary, items):
        keep = self.keep
        max_z_cut = self.depth
        
        def bos(j):
            return j - j % keep

        def eos(j):
            if j % keep == 0: return j
            return j + keep - j%keep

        for i, (flag, span) in enumerate(self.converter(primary, items)):
            subspan = []
            a = None
            for i, si in enumerate(span):
                ki = si[1]
                z_value = ki[2]
                if a is None:
                    if z_value < max_z_cut:
                        a = b = i
                else:
                    if z_value < max_z_cut:
                        b = i
                    else:
                        if i - b < keep: continue
                        yield True, span[bos(a):eos(b+1)]
                        a = None
            if a is not None:
                yield True, span[a:]

    def reset(self):
        self.converter.reset()

# Convert makers array
convert_makers = [Convert_Scan_Increasing, Convert_Scan_Decreasing, 
                  Convert_Scan_Alternating, Convert_Scan_Upmill, Convert_Scan_Downmill]

# =============================================================================
# Entry Cut Classes
# =============================================================================

class SimpleEntryCut:
    """Simple entry cut strategy"""
    def __init__(self, feed):
        self.feed = feed

    def __call__(self, conv, i0, j0, points):
        p = points[0][1]
        if self.feed:
            conv.g.set_feed(self.feed)
        conv.g.safety()
        conv.g.rapid(p[0], p[1])
        if self.feed:
            conv.g.set_feed(conv.feed)

def circ(r, b):
    """Calculate circular arc portion"""
    z = r**2 - (r-b)**2
    if z < 0: z = 0
    return z**.5

class ArcEntryCut:
    """Arc entry cut strategy"""
    def __init__(self, feed, max_radius):
        self.feed = feed
        self.max_radius = max_radius

    def __call__(self, conv, i0, j0, points):
        if len(points) < 2:
            p = points[0][1]
            if self.feed:
                conv.g.set_feed(self.feed)
            conv.g.safety()
            conv.g.rapid(p[0], p[1])
            if self.feed:
                conv.g.set_feed(conv.feed)
            return

        p1 = points[0][1]
        p2 = points[1][1]
        z0 = p1[2]

        lim = int(ceil(self.max_radius / conv.pixelsize))
        r = range(1, lim)

        if self.feed:
            conv.g.set_feed(self.feed)
        conv.g.safety()

        x, y, z = p1
        pixelsize = conv.pixelsize

        if hasattr(__builtins__, 'cmp'):
            cmp_func = cmp
        else:
            cmp_func = lambda a, b: (a > b) - (a < b)
        
        cx = cmp_func(p1[0], p2[0])
        cy = cmp_func(p1[1], p2[1])

        radius = self.max_radius

        if cx != 0:
            h1 = conv.h1
            for di in r:
                dx = di * pixelsize
                i = i0 + cx * di
                if i < 0 or i >= h1: break
                z1 = conv.get_z(i, j0)
                dz = (z1 - z0)
                if dz <= 0: continue
                if dz > dx:
                    conv.g.write("(case 1)")
                    radius = dx
                    break
                rad1 = (dx * dx / dz + dz) / 2
                if rad1 < radius:
                    radius = rad1
                if dx > radius:
                    break

            z1 = min(p1[2] + radius, conv.safetyheight)
            x1 = p1[0] + cx * circ(radius, z1 - p1[2])
            conv.g.rapid(x1, p1[1])
            conv.g.cut(z=z1)

            I = - cx * circ(radius, z1 - p1[2])
            K = (p1[2] + radius) - z1
            
            conv.g.flush(); conv.g.lastgcode = None
            if cx > 0:
                conv.g.write("G3 X%f Z%f I%f K%f" % (p1[0], p1[2], I, K))
            else:
                conv.g.write("G2 X%f Z%f I%f K%f" % (p1[0], p1[2], I, K))
                
            conv.g.lastx = p1[0]
            conv.g.lasty = p1[1]
            conv.g.lastz = p1[2]
        else:
            w1 = conv.w1
            for dj in r:
                dy = dj * pixelsize
                j = j0 - cy * dj
                if j < 0 or j >= w1: break
                z1 = conv.get_z(i0, j)
                dz = (z1 - z0)
                if dz <= 0: continue
                if dz > dy:
                    radius = dy
                    break
                rad1 = (dy * dy / dz + dz) / 2
                if rad1 < radius: radius = rad1
                if dy > radius: break

            z1 = min(p1[2] + radius, conv.safetyheight)
            y1 = p1[1] + cy * circ(radius, z1 - p1[2])
            conv.g.rapid(p1[0], y1)
            conv.g.cut(z=z1)
            
            J =  -cy * circ(radius, z1 - p1[2])
            K = (p1[2] + radius) - z1
            
            conv.g.flush(); conv.g.lastgcode = None
            if cy > 0:
                conv.g.write("G2 Y%f Z%f J%f K%f" % (p1[1], p1[2], J, K))
            else:
                conv.g.write("G3 Y%f Z%f J%f K%f" % (p1[1], p1[2], J, K))
            conv.g.lastx = p1[0]
            conv.g.lasty = p1[1]
            conv.g.lastz = p1[2]
        if self.feed:
            conv.g.set_feed(conv.feed)

# =============================================================================
# Image Matrix Classes
# =============================================================================

class Image_Matrix_List:
    """Image matrix implementation using nested lists (no NumPy)"""
    def __init__(self, width=0, height=0):
        self.width = width
        self.height = height
        self.matrix = []
        self.matrix_skip = []
        self.shape = [width, height]

    def __call__(self, i, j):
        return self.matrix[i][j]

    def Assign(self, i, j, val):
        self.matrix[i][j] = float(val)
        
    def From_List(self, input_list):
        s = len(input_list)
        self.width = s
        self.height = s
        
        for x in range(s):
            self.api()
            for y in range(s):
                self.apj(x, float(input_list[x][y]))

    def FromImage(self, im, pil_format):
        global STOP_CALC
        self.matrix = []

        if pil_format:      
            him, wim = im.size
            for i in range(0, wim):
                self.api()
                for j in range(0, him):
                    pix = im.getpixel((j, i))
                    self.apj(i, pix)
                
        else:
            him = im.width()
            wim = im.height()
            for i in range(0, wim):
                self.api()
                for j in range(0, him):
                    try:    pix = im.get(j, i).split()
                    except: pix = im.get(j, i)
                    self.apj(i, pix[0])

        self.width = wim
        self.height = him
        self.shape = [wim, him]
        self.t_offset = 0

    def pad_w_zeros(self, tool):
        ts = tool.width
        for i in range(len(self.matrix), self.width+ts):
            self.api()
            
        for i in range(0, len(self.matrix)):
            for j in range(len(self.matrix[i]), self.height+ts):
                self.apj(i, -1e1000000)

    def height_calc(self, x, y, tool):
        ts = tool.width
        d = -1e1000000
        ilow = int(x-(ts-1)/2)
        ihigh = int(x+(ts-1)/2+1)
        jlow = int(y-(ts-1)/2)
        jhigh = int(y+(ts-1)/2+1)
            
        icnt = 0
        for i in range(ilow, ihigh):
            jcnt = 0
            for j in range(jlow, jhigh):
                d = max(d, self(j, i) - tool(jcnt, icnt))
                jcnt = jcnt+1 
            icnt = icnt+1
        return d

    def min(self):
        minval = 1e1000000
        for i in range(0, self.width):
            for j in range(0, self.height):
                minval = min(minval, self.matrix[i][j])
        return minval

    def max(self):
        maxval = -1e1000000
        for i in range(0, self.width):
            for j in range(0, self.height):
                maxval = max(maxval, self.matrix[i][j])
        return maxval
        
    def api(self):
        self.matrix.append([])

    def apj(self, i, val):
        fval = float(val)
        self.matrix[i].append(fval)

    def mult(self, val):
        fval = float(val)
        icnt = 0
        for i in self.matrix:
            jcnt = 0
            for j in i:
                self.matrix[icnt][jcnt] = fval * j
                jcnt = jcnt + 1
            icnt = icnt+1
            
    def minus(self, val):
        fval = float(val)
        icnt = 0
        for i in self.matrix:
            jcnt = 0
            for j in i:
                self.matrix[icnt][jcnt] = j - fval
                jcnt = jcnt + 1
            icnt = icnt+1

class Image_Matrix_Numpy:
    """Image matrix implementation using NumPy"""
    def __init__(self, width=2, height=2):
        self.width = width
        self.height = height
        if NUMPY:
            import numpy
            self.matrix = numpy.zeros((width, height), 'float32')
        else:
            self.matrix = [[0.0] * height for _ in range(width)]
        self.shape = [width, height]
        self.t_offset = 0

    def __call__(self, i, j):
        return self.matrix[i+self.t_offset, j+self.t_offset]

    def Assign(self, i, j, val):
        fval = float(val)
        self.matrix[i+self.t_offset, j+self.t_offset] = fval

    def From_List(self, input_list):
        s = len(input_list)
        self.width = s
        self.height = s

        if NUMPY:
            import numpy
            self.matrix = numpy.zeros((s, s), 'float32')
            for x in range(s):
                for y in range(s):
                    self.matrix[x, y] = float(input_list[x][y])
        else:
            self.matrix = [[float(input_list[x][y]) for y in range(s)] for x in range(s)]

    def FromImage(self, im, pil_format):
        global STOP_CALC
        self.matrix = []

        pixLen = 0
        colorImage = False

        if pil_format:
            him, wim = im.size
            if NUMPY:
                import numpy
                self.matrix = numpy.zeros((wim, him), 'float32')
                self.matrix_skip = numpy.zeros((wim, him), 'bool')
                
                if isinstance(im.getpixel((0, 0)), tuple):
                    colorImage = True
                    pixLen = len(im.getpixel((0, 0)))

                for i in range(0, wim):
                    for j in range(0, him):
                        pix = im.getpixel((j, i))
                        # Handle both grayscale and color images
                        if colorImage:
                            # Color image - convert to grayscale using luminance formula
                            if pixLen == 4:  # RGB or RGBA
                                # gray_val = 0.299 * pix[0] + 0.587 * pix[1] + 0.114 * pix[2]
                                if pix[3] == 0:
                                    self.matrix_skip[i, j] = True
                                    gray_val = 255
                                else:
                                    gray_val = pix[0]
                            else:  # Grayscale with alpha
                                gray_val = pix[0]
                        else:
                            # Already grayscale
                            gray_val = pix
                        self.matrix[i, j] = float(gray_val)
            else:
                self.matrix = [[0.0] * him for _ in range(wim)]
                for i in range(0, wim):
                    for j in range(0, him):
                        pix = im.getpixel((j, i))
                        # Handle both grayscale and color images
                        if isinstance(pix, tuple):
                            # Color image - convert to grayscale using luminance formula
                            if len(pix) >= 3:  # RGB or RGBA
                                gray_val = 0.299 * pix[0] + 0.587 * pix[1] + 0.114 * pix[2]
                            else:  # Grayscale with alpha
                                gray_val = pix[0]
                        else:
                            # Already grayscale
                            gray_val = pix
                        self.matrix[i][j] = float(gray_val)
        else:
            him = im.width()
            wim = im.height()
            if NUMPY:
                import numpy
                self.matrix = numpy.zeros((wim, him), 'float32')
                for i in range(0, wim):
                    for j in range(0, him):
                        try:    pix = im.get(j, i).split()
                        except: pix = im.get(j, i)
                        self.matrix[i, j] = float(pix[0])
            else:
                self.matrix = [[0.0] * him for _ in range(wim)]
                for i in range(0, wim):
                    for j in range(0, him):
                        try:    pix = im.get(j, i).split()
                        except: pix = im.get(j, i)
                        self.matrix[i][j] = float(pix[0])
                    
        self.width = wim
        self.height = him
        self.shape = [wim, him]
        self.t_offset = 0

    def pad_w_zeros(self, tool):
        ts = tool.width
        self.t_offset = int((ts-1)/2) 
        to = self.t_offset
        
        w, h = self.shape
        w1 = w + ts-1
        h1 = h + ts-1
        
        if NUMPY:
            import numpy
            temp = numpy.zeros((w1, h1), 'float32')
            for j in range(0, w1):
                for i in range(0, h1):
                    temp[j, i] = -1e1000000
            temp[to:to+w, to:to+h] = self.matrix
            self.matrix = temp
        else:
            temp = [[-1e1000000] * h1 for _ in range(w1)]
            for i in range(w):
                for j in range(h):
                    temp[to+i][to+j] = self.matrix[i][j]
            self.matrix = temp

    def height_calc(self, x, y, tool):
        to = self.t_offset
        ts = tool.width
        d = -1e100000
        
        if NUMPY:
            # skip = self.matrix_skip[y:y+ts, x:x+ts]
            # if skip.all():
            #     return -1
            
            m1 = self.matrix[y:y+ts, x:x+ts]
            d = (m1 - tool.matrix).max()
        else:
            for i in range(ts):
                for j in range(ts):
                    val = self.matrix[y+i][x+j] - tool.matrix[i][j]
                    if val > d:
                        d = val
        return d

    def min(self):
        if NUMPY:
            return self.matrix[self.t_offset:self.t_offset+self.width,
                              self.t_offset:self.t_offset+self.height].min()
        else:
            minval = float('inf')
            for i in range(self.t_offset, self.t_offset+self.width):
                for j in range(self.t_offset, self.t_offset+self.height):
                    if self.matrix[i][j] < minval:
                        minval = self.matrix[i][j]
            return minval
            
    def max(self):
        if NUMPY:
            return self.matrix[self.t_offset:self.t_offset+self.width,
                              self.t_offset:self.t_offset+self.height].max()
        else:
            maxval = float('-inf')
            for i in range(self.t_offset, self.t_offset+self.width):
                for j in range(self.t_offset, self.t_offset+self.height):
                    if self.matrix[i][j] > maxval:
                        maxval = self.matrix[i][j]
            return maxval
            
    def mult(self, val):
        if NUMPY:
            self.matrix = self.matrix * float(val)
        else:
            fval = float(val)
            for i in range(len(self.matrix)):
                for j in range(len(self.matrix[i])):
                    self.matrix[i][j] *= fval
            
    def minus(self, val):
        if NUMPY:
            self.matrix = self.matrix - float(val)
        else:
            fval = float(val)
            for i in range(len(self.matrix)):
                for j in range(len(self.matrix[i])):
                    self.matrix[i][j] -= fval

# Set Image_Matrix based on NumPy availability
if NUMPY:
    Image_Matrix = Image_Matrix_Numpy
else:
    Image_Matrix = Image_Matrix_List

# =============================================================================
# Converter Class
# =============================================================================

class Converter:
    """Main converter class for image to G-code conversion"""
    def __init__(self, BIG, 
                 image, units, tool_shape, pixelsize, pixelstep, safetyheight, tolerance,
                 feed, convert_rows, convert_cols, cols_first_flag, border, entry_cut,
                 roughing_delta, roughing_feed, xoffset, yoffset, splitstep, header, 
                 postscript, edge_offset, disable_arcs):

        self.BIG = BIG
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

        # Percent complete stuff
        self.START_TIME = time()
        row_cnt = 0
        cnt_border = 0
        if self.convert_rows != None:
            row_cnt = ceil(self.w1 / pixelstep) + 2
        col_cnt = 0
        if self.convert_cols != None:
            col_cnt = ceil(self.h1 / pixelstep) + 2
        if self.roughing_delta != 0:
            cnt_mult = ceil(self.image.min() / -self.roughing_delta) + 1
        else:
            cnt_mult = 1
        if self.convert_cols != None or self.convert_rows != None:
            cnt_border = 2
        self.cnt_total = (row_cnt + col_cnt + cnt_border) * cnt_mult
        self.cnt = 0.0

    def one_pass(self):
        """Perform one cutting pass"""
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

        # Mill border
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
        """Main conversion method"""
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
        """Get Z value at given coordinates"""
        try:
            return min(0, max(self.rd, self.cache[x, y]))
        except KeyError:
            self.cache[x, y] = d = self.image.height_calc(x, y, self.tool_shape)
            return min(0.0, max(self.rd, d))

    def get_dz_dy(self, x, y):
        """Get Z derivative in Y direction"""
        y1 = max(0, y-1)
        y2 = min(self.image.shape[0]-1, y+1)
        dy = self.pixelsize * (y2-y1)
        return (self.get_z(x, y2) - self.get_z(x, y1)) / dy

    def get_dz_dx(self, x, y):
        """Get Z derivative in X direction"""
        x1 = max(0, x-1)
        x2 = min(self.image.shape[1]-1, x+1)
        dx = self.pixelsize * (x2-x1)
        return (self.get_z(x2, y) - self.get_z(x1, y)) / dx

    def frange(self, start, stop, step):
        """Float range function"""
        out = []
        i = start
        while i < stop:
            out.append(i)
            i += step
        return out
            
    def mill_rows(self, convert_scan, primary, border_flag=False):
        """Mill in row direction"""
        global STOP_CALC
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
            self.cnt = self.cnt+1
            # progress(self.cnt, self.cnt_total, self.START_TIME, self.BIG)  # Progress reporting disabled
            y = (w1-j-1) * pixelsize + self.yoffset
            scan = []
            for i in irange:
                self.BIG.update()
                if STOP_CALC: return
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
        """Mill in column direction"""
        global STOP_CALC
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
            self.cnt = self.cnt+1
            # progress(self.cnt, self.cnt_total, self.START_TIME, self.BIG)  # Progress reporting disabled
            x = j * pixelsize + self.xoffset
            scan = []
            for i in irange:
                self.BIG.update()
                if STOP_CALC: return
                if self.image.matrix_skip[j, i]:
                    # print(f"Skipping {j}, {i}")
                    continue

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

def convert(*args, **kw):
    """Main convert function"""
    return Converter(*args, **kw).convert()

# =============================================================================
# Configuration Class
# =============================================================================

class GCodeConfig:
    """
    Configuration class for WriteGCode function.
    
    This class provides all the configuration parameters needed by the WriteGCode function.
    It mimics the interface expected by WriteGCode (which was originally designed for a 
    Tkinter GUI) but uses simple Python types instead of Tkinter variables.
    
    Usage Example:
        # Create configuration
        config = GCodeConfig()
        
        # Set basic parameters
        config.set_units("mm")                    # Use metric units
        config.set_tool_type("Ball")              # Use ball end mill
        config.dia.set("3.175")                   # 3.175mm (1/8") tool diameter
        
        # Set cutting parameters
        config.yscale.set("50.0")                 # 50mm image height
        config.z_cut.set("5.0")                   # 5mm maximum depth
        config.f_feed.set("300.0")                # 300mm/min feed rate
        
        # Load image and generate G-code
        config.load_image("heightmap.png")
        gcode_lines = WriteGCode(config, rough_flag=0)
    
    Key Configuration Categories:
        - Boolean Settings: Enable/disable various features
        - Dimensional Settings: Sizes, depths, tolerances (in specified units)
        - Tool Settings: Tool type, diameter, angles
        - Feed Rate Settings: Cutting and plunge speeds
        - Cutting Pattern Settings: How the tool moves across the surface
        - Origin and Units: Coordinate system setup
        - Roughing Pass Settings: Parameters for rough cutting pass
        
    All numeric parameters are stored as strings (to match original interface)
    and are converted to numbers when used by WriteGCode.
    """
    
    class MockVariable:
        """Mock class to simulate Tkinter variable .get() method"""
        def __init__(self, value):
            self.value = value
        def get(self):
            return self.value
        def set(self, value):
            self.value = value
    
    class MockStatus:
        """Mock class for status reporting"""
        def set(self, message):
            print(f"Status: {message}")
        def configure(self, **kwargs):
            print(f"Status configure: {kwargs}")
    
    def __init__(self):
        # =============================================================================
        # Boolean Settings (True/False)
        # =============================================================================
        self.no_comments = self.MockVariable(False)      # Include comments in G-code
        self.show_axis = self.MockVariable(True)         # Show axis in preview (HEADER ONLY - not used in cutting logic)
        self.invert = self.MockVariable(False)           # Invert image (white=deep, black=shallow)
        self.normalize = self.MockVariable(True)         # Normalize image data
        self.cuttop = self.MockVariable(True)            # Cut top (above surface)
        self.cutperim = self.MockVariable(False)         # Cut perimeter
        self.disable_arcs = self.MockVariable(False)     # Disable arc generation
        
        # =============================================================================
        # Dimensional Settings (in units specified by 'units')
        # =============================================================================
        self.yscale = self.MockVariable("1.0")           # Image height in real units
        self.toptol = self.MockVariable("0.0")           # Top tolerance (depth above which to cut)
        self.z_safe = self.MockVariable("0.25")          # Safe Z height for rapid moves
        self.z_cut = self.MockVariable("0.125")          # Maximum cutting depth
        self.dia = self.MockVariable("0.125")            # Tool diameter
        self.stepover = self.MockVariable("0.01")        # Stepover distance between passes
        self.tolerance = self.MockVariable("0.001")      # Path tolerance for simplification
        self.splitstep = self.MockVariable("0.0")        # Split step (0 = disabled)
        
        # =============================================================================
        # Tool Settings
        # =============================================================================
        self.tool = self.MockVariable("Ball")            # Tool type: "Ball", "Flat", "V"
        self.v_angle = self.MockVariable("60.0")         # V-bit angle (degrees)
        
        # =============================================================================
        # Feed Rate Settings (units per minute)
        # =============================================================================
        self.f_feed = self.MockVariable("10.0")          # Feed rate for cutting
        self.p_feed = self.MockVariable("5.0")           # Plunge feed rate
        
        # =============================================================================
        # Cutting Pattern Settings
        # =============================================================================
        self.scanpat = self.MockVariable("Rows")         # Scan pattern: "Rows", "Columns", "C then R"
        self.scandir = self.MockVariable("Alternating")  # Scan direction: "Positive", "Negative", "Alternating", "Up Mill", "Down Mill"
        self.lace_bound = self.MockVariable("None")      # Lace pattern: "None", "Secondary", "Full"
        self.cangle = self.MockVariable("45.0")          # Contact angle for lace patterns (degrees)
        
        # =============================================================================
        # Origin and Units
        # =============================================================================
        self.origin = self.MockVariable("Bot-Left")      # Origin position: "Top-Left", "Top-Center", "Top-Right", 
                                                         #                  "Mid-Left", "Mid-Center", "Mid-Right",
                                                         #                  "Bot-Left", "Bot-Center", "Bot-Right", "Arc-Center"
        self.units = self.MockVariable("in")             # Units: "in" (inches) or "mm" (millimeters)
        
        # =============================================================================
        # Entry Cut Settings
        # =============================================================================
        self.plungetype = self.MockVariable("simple")    # Plunge type: "simple" or "arc"
        
        # =============================================================================
        # G-code Pre/Post Commands
        # =============================================================================
        self.gpre = self.MockVariable("")                # Pre-amble G-code commands (separated by |)
        self.gpost = self.MockVariable("")               # Post-script G-code commands (separated by |)
        
        # =============================================================================
        # Roughing Pass Settings
        # =============================================================================
        self.ROUGH_TOOL = self.MockVariable("Flat")      # Roughing tool type
        self.ROUGH_DIA = self.MockVariable("0.25")       # Roughing tool diameter
        self.ROUGH_V_ANGLE = self.MockVariable("60.0")   # Roughing V-bit angle
        self.ROUGH_R_FEED = self.MockVariable("20.0")    # Roughing feed rate
        self.ROUGH_P_FEED = self.MockVariable("10.0")    # Roughing plunge feed rate
        self.ROUGH_STEPOVER = self.MockVariable("0.05")  # Roughing stepover
        self.ROUGH_DEPTH_PP = self.MockVariable("0.05")  # Roughing depth per pass
        self.ROUGH_OFFSET = self.MockVariable("0.01")    # Roughing offset from final surface
        self.ROUGH_SCANPAT = self.MockVariable("Rows")   # Roughing scan pattern
        self.ROUGH_SCANDIR = self.MockVariable("Alternating")  # Roughing scan direction
        self.ROUGH_CUTPERIM = self.MockVariable(False)   # Cut perimeter in roughing pass
        
        # =============================================================================
        # Image and Output
        # =============================================================================
        self.IMAGE_FILE = ""                             # Path to image file
        self.im = None                                   # PIL Image object
        self.gcode = []                                  # Output G-code lines
        
        # =============================================================================
        # GUI Mock Objects (for compatibility)
        # =============================================================================
        self.statusMessage = self.MockStatus()
        self.statusbar = self.MockStatus()
    
    def update(self):
        """Mock update method for progress reporting"""
        pass
    
    def load_image(self, image_path):
        """
        Load an image for processing
        
        Args:
            image_path (str): Path to the image file
        """
        try:
            if PIL:
                from PIL import Image
                self.im = Image.open(image_path)
                self.IMAGE_FILE = image_path
                print(f"Loaded image: {image_path} ({self.im.size})")
            else:
                raise ImportError("PIL not available")
        except Exception as e:
            print(f"Error loading image {image_path}: {e}")
            self.im = None
            self.IMAGE_FILE = ""
    
    def set_units(self, units):
        """Set units (in or mm)"""
        if units in ["in", "mm"]:
            self.units.set(units)
            
            # Adjust default values based on units
            if units == "mm":
                # Convert inch defaults to mm
                self.yscale.set("25.4")
                self.z_safe.set("6.35")
                self.z_cut.set("3.175")
                self.dia.set("3.175")
                self.stepover.set("0.254")
                self.tolerance.set("0.0254")
                self.f_feed.set("254.0")
                self.p_feed.set("127.0")
                self.ROUGH_DIA.set("6.35")
                self.ROUGH_STEPOVER.set("1.27")
                self.ROUGH_DEPTH_PP.set("1.27")
                self.ROUGH_OFFSET.set("0.254")
                self.ROUGH_R_FEED.set("508.0")
                self.ROUGH_P_FEED.set("254.0")
    
    def set_tool_type(self, tool_type):
        """Set tool type (Ball, Flat, V)"""
        if tool_type in ["Ball", "Flat", "V"]:
            self.tool.set(tool_type)
    
    def set_scan_pattern(self, pattern):
        """Set scan pattern (Rows, Columns, C then R)"""
        if pattern in ["Rows", "Columns", "C then R"]:
            self.scanpat.set(pattern)
    
    def set_scan_direction(self, direction):
        """Set scan direction"""
        valid_directions = ["Positive", "Negative", "Alternating", "Up Mill", "Down Mill"]
        if direction in valid_directions:
            self.scandir.set(direction)
    
    def set_origin(self, origin):
        """Set origin position"""
        valid_origins = ["Top-Left", "Top-Center", "Top-Right", 
                        "Mid-Left", "Mid-Center", "Mid-Right",
                        "Bot-Left", "Bot-Center", "Bot-Right", "Arc-Center"]
        if origin in valid_origins:
            self.origin.set(origin)
    
    def get_config_summary(self):
        """Get a summary of current configuration"""
        summary = {
            "Image": self.IMAGE_FILE,
            "Units": self.units.get(),
            "Tool": f"{self.tool.get()} - {self.dia.get()}",
            "Scale": self.yscale.get(),
            "Depth": self.z_cut.get(),
            "Safe Z": self.z_safe.get(),
            "Feed Rate": self.f_feed.get(),
            "Stepover": self.stepover.get(),
            "Pattern": f"{self.scanpat.get()} - {self.scandir.get()}",
            "Origin": self.origin.get()
        }
        return summary

# =============================================================================
# WriteGCode Function
# =============================================================================

def WriteGCode(self, rough_flag=0, config_file=False):
    """
    Main G-code generation function
    
    Args:
        self: Application instance containing all the settings
        rough_flag: 0 for finish, 1 for roughing pass
        config_file: True to only generate config header
    
    Returns:
        List of G-code lines
    """
    # global Zero
    header = []
    
    if (self.no_comments.get() != True) or (config_file == True):
        header.append('( Code generated by dmap2gcode-'+version+'.py widget )')
        header.append('( by Scorch - 2014 )')
        header.append('(Settings used in dmap2gcode when this file was created)')
        header.append("(=========================================================)")
        
        # BOOL settings
        # header.append('(dmap2gcode_set show_axis  %s )' % (int(self.show_axis.get())))  # HEADER ONLY - not used in cutting logic
        header.append('(dmap2gcode_set invert     %s )' % (int(self.invert.get())))
        header.append('(dmap2gcode_set normalize  %s )' % (int(self.normalize.get())))
        header.append('(dmap2gcode_set cuttop     %s )' % (int(self.cuttop.get())))
        header.append('(dmap2gcode_set cutperim     %s )' % (int(self.cutperim.get())))
        header.append('(dmap2gcode_set disable_arcs %s )' % (int(self.disable_arcs.get())))
        header.append('(dmap2gcode_set no_comments  %s )' % (int(self.no_comments.get())))

        # STRING settings
        header.append('(dmap2gcode_set yscale     %s )' % (self.yscale.get()))
        header.append('(dmap2gcode_set toptol     %s )' % (self.toptol.get()))
        header.append('(dmap2gcode_set vangle     %s )' % (self.v_angle.get()))
        header.append('(dmap2gcode_set stepover   %s )' % (self.stepover.get()))
        header.append('(dmap2gcode_set plFEED     %s )' % (self.p_feed.get()))
        header.append('(dmap2gcode_set z_safe      %s )' % (self.z_safe.get()))
        header.append('(dmap2gcode_set z_cut       %s )' % (self.z_cut.get()))
        header.append('(dmap2gcode_set diatool    %s )' % (self.dia.get()))
        header.append('(dmap2gcode_set origin     %s )' % (self.origin.get()))
        header.append('(dmap2gcode_set tool       %s )' % (self.tool.get()))
        header.append('(dmap2gcode_set units      %s )' % (self.units.get()))
        header.append('(dmap2gcode_set plunge     %s )' % (self.plungetype.get()))
        header.append('(dmap2gcode_set feed       %s )' % (self.f_feed.get()))
        header.append('(dmap2gcode_set lace       %s )' % (self.lace_bound.get()))
        header.append('(dmap2gcode_set cangle     %s )' % (self.cangle.get()))
        header.append('(dmap2gcode_set tolerance  %s )' % (self.tolerance.get()))
        header.append('(dmap2gcode_set splitstep  %s )' % (self.splitstep.get()))
        header.append('(dmap2gcode_set gpre       \042%s\042 )' % (self.gpre.get()))
        header.append('(dmap2gcode_set gpost      \042%s\042 )' % (self.gpost.get()))
        header.append('(dmap2gcode_set scanpat    \042%s\042 )' % (self.scanpat.get()))
        header.append('(dmap2gcode_set scandir    \042%s\042 )' % (self.scandir.get()))
        # header.append('(dmap2gcode_set imagefile  \042%s\042 )' % (self.IMAGE_FILE))  # HEADER ONLY - not used in cutting logic
        
        header.append('(dmap2gcode_set ROUGH_TOOL     %s )' % (self.ROUGH_TOOL.get()))
        header.append('(dmap2gcode_set ROUGH_DIA      %s )' % (self.ROUGH_DIA.get()))
        header.append('(dmap2gcode_set ROUGH_V_ANGLE  %s )' % (self.ROUGH_V_ANGLE.get()))
        header.append('(dmap2gcode_set ROUGH_R_FEED   %s )' % (self.ROUGH_R_FEED.get()))
        header.append('(dmap2gcode_set ROUGH_P_FEED   %s )' % (self.ROUGH_P_FEED.get()))
        header.append('(dmap2gcode_set ROUGH_STEPOVER %s )' % (self.ROUGH_STEPOVER.get()))
        header.append('(dmap2gcode_set ROUGH_DEPTH_PP %s )' % (self.ROUGH_DEPTH_PP.get()))
        header.append('(dmap2gcode_set ROUGH_OFFSET   %s )' % (self.ROUGH_OFFSET.get()))
        header.append('(dmap2gcode_set ROUGH_SCANPAT  \042%s\042 )' % (self.ROUGH_SCANPAT.get()))
        header.append('(dmap2gcode_set ROUGH_SCANDIR  \042%s\042 )' % (self.ROUGH_SCANDIR.get()))
        header.append('(dmap2gcode_set ROUGH_CUTPERIM %s )' % (int(self.ROUGH_CUTPERIM.get())))
        
        header.append("(=========================================================)")

    if (config_file == True):
        self.gcode = []
        self.gcode = header
        return

    # Add pre-processing commands
    for line in self.gpre.get().split('|'):
        header.append(line)

    postscript = self.gpost.get()
    postscript = postscript.replace('|', '\n')
    
    # Check if image is loaded
    pil_format = False
    try:
        test = self.im.width()
    except:
        try:
            test = self.im.size
            pil_format = True
        except:
            self.statusMessage.set("No Image Loaded")
            self.statusbar.configure(bg='red')
            return
    
    # print('PIL format:', pil_format)

    MAT = Image_Matrix()
    MAT.FromImage(self.im, pil_format)

    image_h = float(self.yscale.get())
    pixel_size = image_h / (float(MAT.width) - 1.0)
    image_w = pixel_size * (float(MAT.height) - 1.0)
    tolerance = float(self.tolerance.get())
    safe_z = float(self.z_safe.get())
    splitstep = float(self.splitstep.get())
    toptol = float(self.toptol.get())
    depth = -float(self.z_cut.get())
    Cont_Angle = float(self.cangle.get())
        
    if rough_flag == 0:
        # Finish cut settings
        cutperim = int(self.cutperim.get())
        tool_type = self.tool.get()
        
        tool_diameter = float(self.dia.get())
        rough_depth = 0.0 
        rough_offset = 0.0 
        feed_rate = float(self.f_feed.get())
        rough_feed = float(self.ROUGH_R_FEED.get())
        plunge_feed = float(self.p_feed.get())
        step = max(1, int(floor(float(self.stepover.get()) / pixel_size)))

        edge_offset = 0
        
        if self.tool.get() == "Flat":
            TOOL = make_tool_shape(endmill, tool_diameter, pixel_size)
        elif self.tool.get() == "V":
            v_angle = float(self.v_angle.get())
            TOOL = make_tool_shape(vee_common(v_angle), tool_diameter, pixel_size)
        else:  # "Ball"
            TOOL = make_tool_shape(ball_tool, tool_diameter, pixel_size)
            
        rows = 0
        columns = 0
        columns_first = 0
        if self.scanpat.get() != "Columns":
            rows = 1
        if self.scanpat.get() != "Rows":
            columns = 1 
        if self.scanpat.get() == "C then R":
            columns_first = 1

        converter = self.scandir.get()
        lace_bound_val = self.lace_bound.get()
        
    else:
        # Roughing cut settings
        cutperim = int(self.ROUGH_CUTPERIM.get())
        tool_type = self.ROUGH_TOOL.get()
        
        rough_depth = float(self.ROUGH_DEPTH_PP.get())
        rough_offset = float(self.ROUGH_OFFSET.get())
        tool_diameter = float(self.ROUGH_DIA.get())
        finish_dia = float(self.dia.get())
        
        feed_rate = float(self.ROUGH_R_FEED.get())
        rough_feed = float(self.ROUGH_R_FEED.get())
        plunge_feed = float(self.ROUGH_P_FEED.get())
        step = max(1, int(floor(float(self.ROUGH_STEPOVER.get()) / pixel_size)))

        edge_offset = max(0, (tool_diameter - finish_dia)/2.0)
        
        if self.ROUGH_TOOL.get() == "Flat":
            TOOL = make_tool_shape(endmill, tool_diameter, pixel_size, rough_offset)
        elif self.tool.get() == "V":
            v_angle = float(self.ROUGH_V_ANGLE.get())
            TOOL = make_tool_shape(vee_common(v_angle), tool_diameter, pixel_size, rough_offset)
        else:  # "Ball"
            TOOL = make_tool_shape(ball_tool, tool_diameter, pixel_size, rough_offset)

        rows = 0
        columns = 0
        columns_first = 0
        if self.ROUGH_SCANPAT.get() != "Columns":
            rows = 1
        if self.ROUGH_SCANPAT.get() != "Rows":
            columns = 1 
        if self.ROUGH_SCANPAT.get() == "C then R":
            columns_first = 1

        converter = self.ROUGH_SCANDIR.get()
        lace_bound_val = self.lace_bound.get()
        
    # Convert scan direction to index
    if converter == "Positive":
        conv_index = 0
    elif converter == "Negative":
        conv_index = 1
    elif converter == "Alternating":
        conv_index = 2
    elif converter == "Up Mill":
        conv_index = 3
    elif converter == "Down Mill":
        conv_index = 4
    else:
        conv_index = 2
        fmessage("Converter Error: Setting to, Alternating")
    
    # Create scan converters
    if rows: convert_rows = convert_makers[conv_index]()
    else: convert_rows = None
    if columns: convert_cols = convert_makers[conv_index]()
    else: convert_cols = None

    # Apply lace patterns if needed
    if lace_bound_val != "None" and rows and columns:
        slope = tan(Cont_Angle*pi/180)
        if columns_first:
            convert_rows = Reduce_Scan_Lace(convert_rows, slope, step+1)
        else:
            convert_cols = Reduce_Scan_Lace(convert_cols, slope, step+1)
        if lace_bound_val == "Full":
            if columns_first:
                convert_cols = Reduce_Scan_Lace(convert_cols, slope, step+1)
            else:
                convert_rows = Reduce_Scan_Lace(convert_rows, slope, step+1)

    # Set units
    if self.units.get() == "in":
        units = 'G20'
    else:
        units = 'G21'

    # Apply top tolerance cutting
    if self.cuttop.get() != True:
        if rows == 1:
            convert_rows = Reduce_Scan_Lace_new(convert_rows, toptol, 1)
        if columns == 1:
            convert_cols = Reduce_Scan_Lace_new(convert_cols, toptol, 1)
            
    disable_arcs = self.disable_arcs.get()
    
    # Set entry cut type
    if self.plungetype.get() == "arc" and (not disable_arcs):
        Entry_cut = ArcEntryCut(plunge_feed, .125)
    else:
        Entry_cut = SimpleEntryCut(plunge_feed)
        
    # Normalize image data
    if self.normalize.get():
        a = MAT.min()
        b = MAT.max()
        if a != b:
            MAT.minus(a)
            MAT.mult(1./(b-a))
    else:
        MAT.mult(1/255.0)
        
    xoffset = 0
    yoffset = 0
    
    MAT.mult(depth)
    
    # Calculate origin offsets
    minx = 0
    maxx = image_w
    miny = 0
    maxy = image_h
    midx = (minx + maxx)/2
    midy = (miny + maxy)/2

    CASE = str(self.origin.get())
    if CASE == "Top-Left":
        x_zero = minx
        y_zero = maxy
    elif CASE == "Top-Center":
        x_zero = midx
        y_zero = maxy
    elif CASE == "Top-Right":
        x_zero = maxx
        y_zero = maxy
    elif CASE == "Mid-Left":
        x_zero = minx
        y_zero = midy
    elif CASE == "Mid-Center":
        x_zero = midx
        y_zero = midy
    elif CASE == "Mid-Right":
        x_zero = maxx
        y_zero = midy
    elif CASE == "Bot-Left":
        x_zero = minx
        y_zero = miny
    elif CASE == "Bot-Center":
        x_zero = midx
        y_zero = miny
    elif CASE == "Bot-Right":
        x_zero = maxx
        y_zero = miny
    elif CASE == "Arc-Center":
        x_zero = 0
        y_zero = 0
    else:  # "Default"
        x_zero = 0
        y_zero = 0   

    xoffset = xoffset - x_zero
    yoffset = yoffset - y_zero
    
    # Apply inversion
    if self.invert.get():
        MAT.mult(-1.0)
    else:
        MAT.minus(depth)
        
    self.gcode = []
    
    MAT.pad_w_zeros(TOOL)
    
    START_TIME = time()
    self.gcode = convert(self,
                         MAT,
                         units,
                         TOOL,
                         pixel_size,
                         step,
                         safe_z,
                         tolerance,
                         feed_rate,
                         convert_rows,
                         convert_cols,
                         columns_first,
                         cutperim,
                         Entry_cut,
                         rough_depth,
                         rough_feed,
                         xoffset,
                         yoffset,
                         splitstep,
                         header,
                         postscript,
                         edge_offset,
                         disable_arcs)
    
    return self.gcode

# =============================================================================
# Main function for testing
# =============================================================================

if __name__ == "__main__":
    print("write_gcode.py - G-code generation library")
    print("This library contains the WriteGCode function and its dependencies.")
    print("Import this module to use the WriteGCode function in your application.")
    print()
    
    # Run the example
    example_usage()

# =============================================================================
# Usage Example
# =============================================================================

def generate_gcode_from_image(image_path, config=None, rough_pass=False):
    """
    Example function showing how to use the WriteGCode function with GCodeConfig
    
    Args:
        image_path (str): Path to the image file
        config (GCodeConfig, optional): Configuration object. If None, uses defaults.
        rough_pass (bool): True for roughing pass, False for finish pass
    
    Returns:
        list: G-code lines
    """
    # Create config if not provided
    if config is None:
        config = GCodeConfig()
    
    # Load the image
    config.load_image(image_path)
    
    if config.im is None:
        print("Error: Could not load image")
        return []
    
    # Generate G-code
    try:
        gcode_lines = WriteGCode(config, rough_flag=1 if rough_pass else 0)
        return gcode_lines
    except Exception as e:
        print(f"Error generating G-code: {e}")
        return []

def example_usage():
    """
    Example demonstrating how to use the library
    """
    print("=== G-Code Generation Example ===")
    
    # Create configuration
    config = GCodeConfig()
    
    # Configure for metric units
    config.set_units("mm")
    
    # Set tool parameters
    config.set_tool_type("Ball")
    config.dia.set("3.175")  # 1/8" ball end mill
    
    # Set cutting parameters
    config.yscale.set("50.0")          # 50mm image height
    config.z_cut.set("5.0")            # 5mm maximum depth
    config.z_safe.set("10.0")          # 10mm safe height
    config.f_feed.set("300.0")         # 300mm/min feed rate
    config.p_feed.set("150.0")         # 150mm/min plunge rate
    config.stepover.set("1.0")         # 1mm stepover
    
    # Set cutting pattern
    config.set_scan_pattern("Rows")
    config.set_scan_direction("Alternating")
    config.set_origin("Bot-Left")
    
    # Enable arc entry cuts
    config.plungetype.set("arc")
    
    # Configure roughing pass
    config.ROUGH_DIA.set("6.35")       # 1/4" rough end mill
    config.ROUGH_DEPTH_PP.set("2.0")   # 2mm per pass
    config.ROUGH_STEPOVER.set("3.0")   # 3mm roughing stepover
    config.ROUGH_R_FEED.set("600.0")   # 600mm/min roughing feed
    
    # Display configuration
    print("\nConfiguration Summary:")
    for key, value in config.get_config_summary().items():
        print(f"  {key}: {value}")
    
    # Example with a hypothetical image file
    image_file = "example_heightmap.png"
    
    print(f"\nNote: To generate G-code, you would call:")
    print(f"  config.load_image('{image_file}')")
    print(f"  rough_gcode = WriteGCode(config, rough_flag=1)")
    print(f"  finish_gcode = WriteGCode(config, rough_flag=0)")
    
    return config

# =============================================================================
# Main function for testing
# =============================================================================
