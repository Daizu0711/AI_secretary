# Standing Waves and Resonance + Wave Phenomena Study Materials

## Topic 1: Standing Waves and Resonance

### Guiding Questions
• What distinguishes standing waves from travelling waves?
• How does the form of standing waves depend on the boundary conditions?
• How can the application of force result in resonance within a system?

### Learning Goals
1. Describe the nature and formation of standing waves in terms of the superposition of two traveling waves.
2. Distinguish between standing and travelling waves.
3. Observe, sketch, and interpret standing wave patterns in strings and pipes including all nodes and antinodes for each type of boundary condition.
4. Solve problems involving the frequency of a harmonic, length of the standing wave, and the speed of the wave.
5. Describe the effects of light, critical, and heavy damping on the system.
6. Sketch a graph of the variation of the amplitude of vibration with driving frequency of an object close to its natural frequency of vibration.
7. Explain and provide examples of useful and destructive resonance including natural frequency and amplitude of oscillation based on driving frequency.

---

## 1. Nature of Standing Waves

### Key Concepts
- **Standing Wave**: A wave that does not appear to be traveling; parts of the wave remain stationary (nodes).
- **Nodes (節)**: Points where displacement is always zero (静止状態).
- **Antinodes (腹)**: Points where the maximum displacement takes place.
- **No energy transfer**: There is no transfer of energy in a standing wave.

### Visual Representation
```
Standing Wave Pattern:
   Antinode   Node   Antinode   Node   Antinode
      ↑        ↓      ↑        ↓      ↑
    ╻╻╻╻╻   ╻╻╻╻   ╻╻╻╻╻   ╻╻╻╻   ╻╻╻╻╻
      ↑        ↓      ↑        ↓      ↑
```

---

## 2. Travelling vs. Standing Waves

### Comparison

| Aspect | Travelling Wave | Standing Wave |
|--------|----------------|---------------|
| **Amplitude** | All points have the same amplitude | All points have different amplitudes; Max = 2A, Min = 0 |
| **Frequency** | Same frequency throughout the wave (f) | Same frequency throughout the wave (f) |
| **Wavelength** | Shortest distance between 2 points in phase | 2 × distance between two adjacent nodes (λ) |
| **Phase** | All points between 2 nodes have the same phase (move up/down in sync) | All points along a wavelength have a different phase |
| **Energy** | Energy transmitted | No energy transmitted |

---

## 3. Formation of Standing Waves

### Key Points
- A standing wave is produced when **two identical waves travelling in opposite directions meet**.
- Often the result of **interference between an incident (original) wave and a reflected wave**.
- Interactive demonstration: https://www.walter-fendt.de/html5/phen/standingwavereflection_en.htm

### Formation Diagram
```
Incident Wave → Reflects → Incident + Reflected → Standing Wave
```

---

## 4. Standing Waves in Musical Instruments

### Key Points
- Instruments make sound by making standing waves vibrating at their own natural/resonant frequencies.
- Examples: vibrating membrane of drum, vibrating metal of bell, vibrating guitar strings, vibrating column of air for pipes.
- The source frequencies are determined by the size of the instrument, which affects "how many waves" can fit inside.
- The sound that then travels in the air has the same frequency as that of the source.

---

## 5. Standing Waves in Strings

### 5.1 Two Fixed Boundaries

```
String length L with fixed ends

1st harmonic (fundamental):
   λ₁ = 2L        f₁ = v/λ₁ = v/(2L)

2nd harmonic:
   λ₂ = L         f₂ = 2v/(2L) = 2f₁

3rd harmonic:
   λ₃ = 2L/3      f₃ = 3v/(2L) = 3f₁
```

### Formula Summary: String Fixed-Fixed
- **Wavelength (nth harmonic)**: λₙ = 2L / n
- **Frequency (nth harmonic)**: fₙ = n · v / (2L)
- **Where n = 1, 2, 3, ...** (harmonic number)
- v = wave speed

### 5.2 Harmonics Named by Frequency Ratio
- A harmonic is named by the ratio of its frequency to that of the first harmonic.
- (So f = 5f₀ is the 5th harmonic, even if it's not the 5th possible standing wave.)

### 5.3 Pipe Standing Waves

#### Pipe: Open-Open or Closed-Closed
```
λ₁ = 2L        f₁ = v/(2L)
λ₂ = L         f₂ = 2v/(2L) = 2f₁
λ₃ = 2L/3      f₃ = 3v/(2L) = 3f₁
```
- **Formula**: λₙ = 2L / n, fₙ = n · v / (2L), where n = 1, 2, 3, ...

#### Pipe: Closed-Open
```
1st harmonic (n=1):  λ₁ = 4L        f₁ = v/(4L)
3rd harmonic (n=3):  λ₃ = 4L/3      f₃ = 3v/(4L)
5th harmonic (n=5):  λ₅ = 4L/5      f₅ = 5v/(4L)
7th harmonic (n=7):  λ₇ = 4L/7      f₇ = 7v/(4L)
```
- **Important**: Only odd harmonics (n = 1, 3, 5, 7, ...)
- **Formula**: λₙ = 4L / n (n = 1, 3, 5, ...), fₙ = n · v / (4L) (n = 1, 3, 5, ...)

### Visual: Boundary Conditions
- **Fixed end** → Node (displacement = 0)
- **Free end** → Antinode (maximum displacement)
- **Open end** → Antinode (max air motion)
- **Closed end** → Node (no air motion)

---

## 6. Problem-Solving Strategy

### General Steps
Most problems involve either:
1. Finding harmonic frequencies / wave speed
2. Finding the lengths required for resonance

**Learn this strategy — do not memorize specific situations:**

1. Identify the type of standing wave (closed-closed, closed-open, open-open)
2. Sketch the first few harmonics (closed/fixed end must be node, open/loose end must be antinode)
3. Relate L and λ for each harmonic
4. Deduce pattern → wavelength formula for nth harmonic
5. Relate frequency, wavelength, and speed using **v = fλ**

---

## 7. Example Problems

### Problem 1: First Harmonic Frequency (Open Pipe)
**Determine the first harmonic frequency of an air column open at both ends ("open pipe") which has a length of 45 cm. The sound waves in air have a speed of 340 m/s.**

**Solution:**
- λ₁ = 2L = 2 × 0.45 m = 0.90 m
- f₁ = v / λ₁ = 340 / 0.90 ≈ **377.8 Hz**

### Problem 2: Resonance in Closed Tube
**A glass tube is closed at one end. The air column it contains has a length that can be varied between 0.5 m and 1.5 m. If a tuning fork of frequency 306 Hz is sounded at the top of the tube, at which lengths of the air column would resonance occur? Neglect end correction and take the speed of sound to be 330 m/s.**

**Solution (Closed-Open Pipe):**
- fₙ = n · v / (4L), where n = 1, 3, 5, ...
- L = n · v / (4f) = n · 330 / (4 × 306) = n · 330 / 1224 = n · 0.270 m
- For n = 1: L₁ = 0.270 m ✗ (outside 0.5–1.5 m range)
- For n = 3: L₃ = 0.810 m ✓ (within range)
- For n = 5: L₅ = 1.350 m ✓ (within range)
- For n = 7: L₇ = 1.890 m ✗ (exceeds 1.5 m)
- **Resonance occurs at L ≈ 0.810 m and L ≈ 1.350 m**

---

## 8. 20 Practice Problems: Standing Waves and Resonance

### Difficulty Level: Easy (6 questions) | Medium (7 questions) | Hard (7 questions)

#### Easy Level

1. **Q1**: A string of length 1.2 m is fixed at both ends. If the wave speed is 240 m/s, find the frequency of the first harmonic.

2. **Q2**: A pipe open at both ends has a length of 0.8 m. Find the frequency of the second harmonic. (v = 340 m/s)

3. **Q3**: A standing wave on a string fixed at both ends has a wavelength of 0.6 m. What is the length of the string?

4. **Q4**: A pipe closed at one end has a fundamental frequency of 256 Hz. If v = 340 m/s, find the length of the pipe.

5. **Q5**: What is the frequency of the third harmonic of a string 0.5 m long with wave speed 300 m/s?

6. **Q6**: A pipe closed at one end resonates at lengths 0.26 m and 0.78 m with the same tuning fork. Find the frequency of the fork. (v = 340 m/s)

#### Medium Level

7. **Q7**: A string 0.8 m long is fixed at both ends and vibrates at a speed of 320 m/s. Find the frequency and wavelength of the 4th harmonic.

8. **Q8**: A pipe closed at one end has a length of 0.5 m. Find the first three resonant frequencies. (v = 330 m/s)

9. **Q9**: In a resonance experiment with a closed pipe, two consecutive harmonics are observed at air column lengths of 43.4 cm and 61.1 cm. Find the speed of sound.

10. **Q10**: A guitar string has a linear mass density of 0.005 kg/m and tension of 100 N. If the string is 0.65 m long, find the fundamental frequency.

11. **Q11**: A pipe open at both ends has a fundamental frequency of 440 Hz. What length must the pipe be? (v = 343 m/s)

12. **Q12**: A standing wave pattern on a string fixed at both ends shows 5 antinodes. If the string length is 1.0 m and wave speed is 200 m/s, find the frequency.

13. **Q13**: A tuning fork of frequency 426 Hz produces resonance in a closed pipe. If the pipe length can vary from 0.2 m to 1.0 m, at what lengths will resonance occur? (v = 340 m/s)

#### Hard Level

14. **Q14**: A pipe 0.75 m long is closed at one end. Find all resonant frequencies in the range 0–1000 Hz. (v = 340 m/s)

15. **Q15**: A string fixed at both ends produces harmonics at frequencies 240 Hz, 360 Hz, and 480 Hz. What is the fundamental frequency? What is the length of the string if v = 300 m/s?

16. **Q16**: In a resonance tube experiment, the first resonance occurs at L₁ = 25.0 cm and the second resonance at L₂ = 75.0 cm (neglecting end correction). Find the frequency of the tuning fork and the speed of sound.

17. **Q17**: A pipe open at both ends has a fundamental frequency of 300 Hz. When one end is closed, the fundamental frequency becomes 212 Hz. Explain why and find the new fundamental if the pipe length is doubled.

18. **Q18**: A standing wave is formed on a string of length 1.5 m fixed at both ends. The wave speed is 330 m/s. Find the distance between consecutive nodes and the amplitude ratio between an antinode and a node.

19. **Q19**: A tuning fork produces resonance in an open pipe at lengths 18.0 cm, 54.0 cm, and 90.0 cm. What is the frequency of the tuning fork? (v = 340 m/s)

20. **Q20**: A pipe closed at one end has a fundamental frequency of 256 Hz. When the temperature increases, the speed of sound increases to 350 m/s. Find the new fundamental frequency and the new lengths for the first three overtones.

---

## Topic 2: Wave Phenomena

### Guiding Questions
• How are observations of wave behaviours at a boundary between different media explained?
• How is the behaviour of waves passing through apertures represented?
• What happens when two waves meet at a point in space?

### Learning Objectives
• Describe single-slit diffraction including intensity patterns as given by sin θ = λ / b
• Explain that the single-slit pattern modulates the double slit interference pattern
• Determine the angles of maxima for multiple slits and diffraction gratings using nλ = d sin θ

---

## 1. Single Slit Diffraction

### Key Concepts
- Diffraction through a single narrow slit produces a diffraction pattern.
- **Huygens' principle**: Every point on a wavefront acts as a source of secondary wavelets.
- The secondary wavelets are **coherent** (come from the same source) and interfere with each other, creating the diffraction pattern.

### Constructive and Destructive Interference

| Interference Type | Path Difference |
|------------------|-----------------|
| **Constructive (bright)** | Whole wavelengths: 1λ, 2λ, 3λ, … |
| **Destructive (dark)** | Half wavelengths: λ/2, 3λ/2, 5λ/2, … |

### First Minimum (Dark Fringe)
- If the slit is divided into points and we find the angle where the path difference between the top and bottom rays is one wavelength (λ), then points separated by half the slit width will have a path difference of λ/2 and interfere destructively.
- **Formula**: sin θ = λ / b (where b = slit width)

### Small Angle Approximation
- If θ is very small, sin θ ≈ θ (in radians). Then: **θ = λ / b**

### Example Problem 1
**The first diffraction minimum using a single slit of opening 2.0 µm is at an angle of 12.5°. What is the wavelength of the light used?**

**Solution**: λ = b sin θ = (2.0 × 10⁻⁶ m) × sin(12.5°) ≈ (2.0 × 10⁻⁶) × 0.216 ≈ 4.32 × 10⁻⁷ m = **432 nm**

---

## 2. Multiple Slits and Diffraction Gratings

### Double Slit Interference
- For two slits, constructive interference occurs when: **nλ = d sin θ**
  - d = slit separation
  - n = order (n = 0, ±1, ±2, ...)

### Diffraction Grating
- A diffraction grating has many slits (typically 600 lines/mm). It spreads light into a spectrum based on wavelength.
- **Formula (same as double slit)**: **nλ = d sin θ**
- Where **d = 1 / (number of lines per unit length)**
  - For 600 lines/mm: d = 1/600 mm = 1.67 × 10⁻⁶ m

### Line Spectra
- Each element emits light at characteristic wavelengths (line spectra).
- When a diffraction grating is used, the emitted wavelengths can be measured.

### Example Problem 4: Diffraction Grating with White Light
**If blue light of wavelength 450 nm and red light of wavelength 700 nm are viewed through a grating with 600 lines/mm, at what angle will the first bright blue and red lines be seen?**

**Solution:**
- d = 1/600 mm = 1.667 × 10⁻⁶ m
- For blue (n = 1): sin θ_B = λ_B / d = 450 × 10⁻⁹ / 1.667 × 10⁻⁶ = 0.270 → θ_B ≈ **15.7°**
- For red (n = 1): sin θ_R = λ_R / d = 700 × 10⁻⁹ / 1.667 × 10⁻⁶ = 0.420 → θ_R ≈ **24.8°**

### Example Problem 5: Angle Between Orders
**Light of wavelength 680 nm falls normally on a diffraction grating that has 600 lines per mm.**
- a) **What is the angle separating the first order (n = 1) from the second (n = 2)?**
- b) **How many maxima can be seen?**

**Solution:**
- d = 1/600 mm = 1.667 × 10⁻⁶ m
- λ = 680 × 10⁻⁹ m
- n = 1: sin θ₁ = λ / d = 680 × 10⁻⁹ / 1.667 × 10⁻⁶ = 0.408 → θ₁ ≈ **24.1°**
- n = 2: sin θ₂ = 2λ / d = 0.816 → θ₂ ≈ **54.7°**
- Angle separating orders: θ₂ − θ₁ = 54.7° − 24.1° = **30.6°**
- How many maxima: nλ ≤ d → n ≤ d/λ = 1.667 × 10⁻⁶ / 680 × 10⁻⁹ = 2.45 → n = 0, ±1, ±2 (**5 maxima total**)

### Example Problem 6: Laser Wavelength
**After passing green laser light through a few parallel slits of spacing 0.059 mm, an interference pattern was seen on a screen placed 3.12 m from the slits. If the distance from the centre of the pattern to the centre of the third fringe was 8.42 cm.**

**Solution:**
- L = 3.12 m, y₃ = 8.42 cm = 0.0842 m
- tan θ₃ = y₃ / L = 0.0842 / 3.12 = **0.0270**
- sin θ₃ ≈ tan θ₃ ≈ **0.0270** (small angle approximation)
- θ₃ = arctan(0.0270) ≈ **1.547°** ≈ **0.0270 rad**
- λ = d sin θ₃ / n = (0.059 × 10⁻³) × 0.0270 / 3 = **5.31 × 10⁻⁷ m = 531 nm**

---

## 3. 20 Practice Problems: Wave Phenomena

### Difficulty Level: Easy (6 questions) | Medium (7 questions) | Hard (7 questions)

#### Easy Level

1. **Q1**: Light of wavelength 500 nm passes through a single slit of width 0.10 mm. Find the angle of the first minimum.

2. **Q2**: A diffraction grating has 500 lines/mm. At what angle will the first-order maximum appear for light of wavelength 600 nm?

3. **Q3**: If the first minimum in a single-slit diffraction pattern is at 15°, and the slit width is 0.20 µm, what is the wavelength?

4. **Q4**: Red light (λ = 700 nm) and blue light (λ = 400 nm) are viewed through a grating with 600 lines/mm. Compare the angular positions of the first-order maxima.

5. **Q5**: A single slit of width 0.05 mm is illuminated with light of wavelength 600 nm. Find the angular width of the central maximum.

6. **Q6**: Light of wavelength 550 nm falls on a diffraction grating with 400 lines/mm. What is the maximum order that can be observed?

#### Medium Level

7. **Q7**: A diffraction pattern is formed on a wall 2.0 m from a 0.10 mm slit illuminated with light of wavelength 600 nm. How wide is the central maximum?

8. **Q8**: A diffraction grating with 600 lines/mm is used to view light of wavelength 680 nm. Find the angular separation between the first and second orders.

9. **Q9**: In a single-slit experiment, the angle of the second minimum is 25°. If the slit width is 0.15 µm, find the wavelength of the light.

10. **Q10**: A diffraction grating (500 lines/mm) is used with white light. Find the range of wavelengths visible in the second order if the spectrometer can detect angles up to 90°.

11. **Q11**: Light from a helium-neon laser (λ = 632.8 nm) passes through a single slit of width 0.50 mm. Find the distance between the first minima on either side of the central maximum on a screen 2.0 m away.

12. **Q12**: A diffraction grating with 600 lines/mm is used to resolve two spectral lines at 589.0 nm and 589.6 nm. What is the minimum number of lines that must be illuminated?

13. **Q13**: In a double-slit experiment with slit separation 0.5 mm, light of wavelength 600 nm is used. The screen is 2.0 m away. Find the distance between the central maximum and the third bright fringe.

#### Hard Level

14. **Q14**: A diffraction grating with 500 lines/mm is used to view the spectrum of a hydrogen discharge tube. The H-α line has wavelength 656.3 nm and the H-β line has wavelength 486.1 nm. Find the minimum resolving power required to just resolve these two lines in the first order.

15. **Q15**: A single slit of width a is illuminated by light of wavelength λ. Derive the condition for the first minimum and show that the angular width of the central maximum is 2λ/a (for small angles).

16. **Q16**: A diffraction grating is used to measure the wavelength of a sodium lamp. The sodium D-line consists of two wavelengths 589.0 nm and 589.6 nm. If the grating has 500 lines/mm and the observation is in the second order, find the minimum number of slits that must be used to resolve the two lines.

17. **Q17**: In a single-slit diffraction experiment, the central maximum is observed to have an angular width of 30°. If the slit width is 0.20 µm, find the wavelength of the light.

18. **Q18**: A diffraction grating with 400 lines/mm is used to view the spectrum. Light of wavelength 500 nm is incident normally. Find the maximum number of orders that can be observed, and the angular position of the last observable order.

19. **Q19**: In a single-slit experiment, the intensity at an angle θ is given by I = I₀ (sin β / β)² where β = (πb/λ) sin θ. Find the angle at which the intensity falls to half its maximum value (half-maximum points of the central maximum).

20. **Q20**: A diffraction grating (600 lines/mm) is used with a He-Ne laser (λ = 632.8 nm). Light is viewed on a screen 2.5 m away. Find the distance between the central maximum and the second-order maximum on the screen.

---

## Key Equations Summary

### Standing Waves and Resonance
| Equation | Description |
|----------|-------------|
| λₙ = 2L / n | Wavelength for nth harmonic, string fixed-fixed |
| fₙ = n · v / (2L) | Frequency for nth harmonic, string fixed-fixed |
| λₙ = 2L / n | Wavelength for nth harmonic, pipe open-open/closed-closed |
| fₙ = n · v / (2L) | Frequency for nth harmonic, pipe open-open/closed-closed |
| λₙ = 4L / n (n = 1, 3, 5, …) | Wavelength for nth harmonic, pipe closed-open |
| fₙ = n · v / (4L) (n = 1, 3, 5, …) | Frequency for nth harmonic, pipe closed-open |
| v = fλ | Wave speed equation |
| f₀ = v / (2L) | Fundamental frequency, string or open pipe |
| f₀ = v / (4L) | Fundamental frequency, closed-open pipe |

### Wave Phenomena
| Equation | Description |
|----------|-------------|
| sin θ = λ / b | First minimum, single-slit diffraction |
| nλ = d sin θ | Maxima, double slit / diffraction grating |
| d = 1 / (lines per unit length) | Grating spacing |
| Resolving power: R = λ / Δλ = nN | R = wavelength / wavelength difference, N = total lines |
| I = I₀ (sin β / β)² | Intensity, single-slit diffraction |
| β = (πb/λ) sin θ | Phase factor, single-slit diffraction |

---

## Study Tips

1. **Always sketch the standing wave pattern** first — identify nodes and antinodes, and determine whether ends are fixed (node) or free/open (antinode).

2. **Memorize the harmonic patterns**:
   - String fixed-fixed / pipe open-open/closed-closed: All harmonics (n = 1, 2, 3, …)
   - Pipe closed-open: Only odd harmonics (n = 1, 3, 5, 7, …)

3. **For diffraction problems**, always:
   - Identify whether it's single-slit or double-slit/grating
   - Write down the given values (λ, b, d, θ, n)
   - Choose the correct formula
   - Check if small angle approximation is valid

4. **Resonance problems**: Look for consecutive lengths or frequencies to determine the harmonic number and then calculate unknowns.

5. **Practice unit conversions**: nm → m, mm → m, cm → m consistently.

6. **Visualize the patterns**: Use the Walter Fendt simulations for standing waves and diffraction.

### Additional Resources
- Standing wave simulation: https://www.walter-fendt.de/html5/phen/standingwavereflection_en.htm
- Single slit diffraction: https://courses.lumenlearning.com/suny-physics/chapter/27-5-single-slit-diffraction/
- Diffraction grating simulation: https://iwant2study.org/lookangejss/04waves_11superposition/ejss_model_MultipleSlitDiffraction/