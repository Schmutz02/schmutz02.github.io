"use strict";

const canvas = document.getElementById("mainCanvas");
const ctx = canvas.getContext("2d");

const sampleInput = document.getElementById("samples");
const depthInput = document.getElementById("depth");
const scaleSlider = document.getElementById("scale");
const animCheckbox = document.getElementById("animate");
const scaleOutput = document.getElementById("scaleOutput");
let currentScale = 1 << scaleSlider.value;
scaleOutput.innerHTML = `Downscale (${currentScale}) ${canvas.width / currentScale}x${canvas.height / currentScale}`;
scaleSlider.oninput = function () {
    currentScale = 1 << scaleSlider.value;
    scaleOutput.innerHTML = `Downscale (${currentScale}) ${canvas.width / currentScale}x${canvas.height / currentScale}`;
}

document.getElementById("saveButton").onclick = function () {
    const link = document.createElement("a");
    link.setAttribute("download", new Date(Date.now()).toISOString() + ".png");
    link.setAttribute("href", canvas.toDataURL("image/png"));
    link.click();
    link.remove();
};

let rendering = false;
document.getElementById("renderButton").onclick = function() {
    canvas.style.display = "block";
    if (rendering) {
        rendering = false;
        this.innerHTML = "Render";
    } else {
        rendering = true;
        this.innerHTML = "Cancel";
        render(depthInput.value, sampleInput.value, currentScale);
    }
}

const fov = 20;
const focusDist = 10;
const aspectRatio = canvas.width / canvas.height;
const viewportHeight = 2 * Math.tan(fov * Math.PI / 180 / 2) * focusDist;
const viewportWidth = viewportHeight * aspectRatio;

const lookFrom = new Vector3(13, 2, 3);
const lookAt = new Vector3(0, 0, 0);
const vUp = new Vector3(0, 1, 0);
const w = Vector3.sub(lookFrom, lookAt).normalize();
const u = vUp.cross(w).normalize();
const v = w.cross(u);

const defocusAngle = 0.6;
const defocusRadius = focusDist * Math.tan(defocusAngle / 2 * Math.PI / 180);
const defocusU = Vector3.scale(u, defocusRadius);
const defocusV = Vector3.scale(v, defocusRadius);

const viewportU = Vector3.scale(u, viewportWidth)
const viewportV = Vector3.scale(v, -viewportHeight);

let pixelDeltaU;
let pixelDeltaV;
let pixel00;

function render(depth, samples, scale) {
    const buffer = ctx.createImageData(canvas.width / scale, canvas.height / scale);
    for (let i = 0; i < buffer.data.length; i += 4) {
        buffer.data[i + 0] = 0.1 * 255;
        buffer.data[i + 1] = 0.3 * 255;
        buffer.data[i + 2] = 0.6 * 255;
        buffer.data[i + 3] = 1.0 * 255;
    }

    pixelDeltaU = Vector3.scale(viewportU, 1 / buffer.width);
    pixelDeltaV = Vector3.scale(viewportV, 1 / buffer.height);

    const viewportUpperLeft = Vector3.sub(lookFrom, Vector3.scale(w, focusDist)).sub(Vector3.scale(viewportU, 0.5)).sub(Vector3.scale(viewportV, 0.5));
    pixel00 = Vector3.add(viewportUpperLeft, Vector3.add(pixelDeltaU, pixelDeltaV).scale(0.5));

    const matGround = new Lambertian({ r: 0.5, g: 0.5, b: 0.5 });
    const mat1 = new Dielectric(1.5);
    const mat2 = new Lambertian({ r: 0.4, g: 0.2, b: 0.1 });
    const mat3 = new Metal({ r: 0.7, g: 0.6, b: 0.5 }, 0);
    let world = [
        new Sphere(new Vector3(0, -1000, 0), 1000, matGround),
        new Sphere(new Vector3(0, 1, 0), 1, mat1),
        new Sphere(new Vector3(-4, 1, 0), 1, mat2),
        new Sphere(new Vector3(4, 1, 0), 1, mat3),
    ];

    for (let a = -11; a < 11; a++) {
        for (let b = -11; b < 11; b++) {
            let randomMat = Math.random();
            let center = new Vector3(a + 0.9 * Math.random(), 0.2, b + 0.9 * Math.random());

            if (Vector3.sub(center, new Vector3(4, 0.2, 0)).length() > 0.9) {
                if (randomMat < 0.8) {
                    let col1 = randomColor();
                    let col2 = randomColor();
                    let albedo = {
                        r: col1.r * col2.r,
                        g: col1.g * col2.g,
                        b: col1.b * col2.b,
                    };

                    let mat = new Lambertian(albedo);
                    world.push(new Sphere(center, 0.2, mat));
                } else if (randomMat < 0.95) {
                    let albedo = randomColor(0.5, 1);
                    let fuzz = Math.random() * 0.5;
                    let mat = new Metal(albedo, fuzz);
                    world.push(new Sphere(center, 0.2, mat));
                } else {
                    let mat = new Dielectric(1.5);
                    world.push(new Sphere(center, 0.2, mat));
                }
            }
        }
    }

    computeImage(buffer, world, depth, samples, scale);
}

async function computeImage(buffer, world, depth, samples, scale) {
    ctx.scale(scale, scale);

outer:
    for (let y = 0; y < buffer.height; y++) {
        for (let x = 0; x < buffer.width; x++) {
            if (!rendering) {
                break outer;
            }

            let pixelColor = { r: 0, g: 0, b: 0 };
            for (let i = 0; i < samples; i++) {
                let ray = getRay(x, y);
                let color = rayColor(ray, depth, world);
                pixelColor.r += color.r;
                pixelColor.g += color.g;
                pixelColor.b += color.b;
            }

            const index = (y * buffer.width + x) * 4;
            buffer.data[index + 0] = linearToGamma(pixelColor.r / samples) * 255;
            buffer.data[index + 1] = linearToGamma(pixelColor.g / samples) * 255;
            buffer.data[index + 2] = linearToGamma(pixelColor.b / samples) * 255;
        }
        await new Promise(resolve => setTimeout(resolve, 0));

        if (animCheckbox.checked) {
            ctx.putImageData(buffer, 0, 0);
            ctx.drawImage(canvas, 0, 0);
        }
    }
    ctx.putImageData(buffer, 0, 0);
    ctx.drawImage(canvas, 0, 0);

    ctx.scale(1 / scale, 1 / scale);
    rendering = false;
    document.getElementById("renderButton").innerHTML = "Render";
}

function getRay(x, y) {
    let pixelCenter = Vector3.add(pixel00, Vector3.add(Vector3.scale(pixelDeltaU, x), Vector3.scale(pixelDeltaV, y)));
    let pixelSample = Vector3.add(pixelCenter, pixelSampleSquare());

    let origin = defocusAngle <= 0 ? lookFrom : defocusDiskSample();
    return new Ray(origin, Vector3.sub(pixelSample, origin));
}

function defocusDiskSample() {
    let p = Vector3.randomInUnitCircle();
    return Vector3.add(lookFrom, Vector3.scale(defocusU, p.x)).add(Vector3.scale(defocusV, p.y));
}

function pixelSampleSquare() {
    let px = Math.random() - 0.5;
    let py = Math.random() - 0.5;
    return new Vector3(px * pixelDeltaU.x, py * pixelDeltaV.y);
}

function rayColor(ray, depth, hittableList) {
    if (depth <= 0)
        return { r:0, g:0, b:0 };

    let tempRec = new HitRecord();
    let rec = {};
    let hitAnything = false;
    let closest = Infinity;

    for (let hittable of hittableList) {
        if (hittable.hit(ray, new Interval(0.001, closest), tempRec)) {
            hitAnything = true;
            closest = tempRec.t;
            rec = Object.assign({}, tempRec);
        }
    }

    if (hitAnything)
    {
        let attenuation = { r:0, g:0, b:0 };
        let scattered = new Ray();
        if (rec.material.scatter(ray, rec, attenuation, scattered)) {
            let color = rayColor(scattered, depth - 1, hittableList);
            return {
                r: attenuation.r * color.r,
                g: attenuation.g * color.g,
                b: attenuation.b * color.b,
            };
        }
        return {
            r: 0,
            g: 0,
            b: 0,
        };
    }

    let direction = Vector3.normalized(ray.direction);
    let a = 0.5 * (direction.y + 1);
    return {
        r: (1 - a) * 1 + a * 0.5,
        g: (1 - a) * 1 + a * 0.7,
        b: (1 - a) * 1 + a * 1.0,
    };
}

function linearToGamma(linearComponent) {
    return Math.sqrt(linearComponent);
}

function randomColor(min, max) {
    min = min === undefined ? 0 : min;
    max = max === undefined ? 1 : max;

    let range = max - min;
    return {
        r: Math.random() * range + min,
        g: Math.random() * range + min,
        b: Math.random() * range + min,
    }
}
