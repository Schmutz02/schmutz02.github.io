class Vector3 {
    constructor(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    }

    sub(other) {
        this.x -= other.x;
        this.y -= other.y;
        this.z -= other.z;
        return this;
    }

    static sub(a, b) {
        return new Vector3(
            a.x - b.x,
            a.y - b.y,
            a.z - b.z);
    }

    add(other) {
        this.x += other.x;
        this.y += other.y;
        this.z += other.z;
        return this;
    }

    static add(a, b) {
        return new Vector3(
            a.x + b.x,
            a.y + b.y,
            a.z + b.z);
    }

    mul(other) {
        this.x *= other.x;
        this.y *= other.y;
        this.z *= other.z;
        return this;
    }

    static mul(a, b) {
        return new Vector3(
            a.x * b.x,
            a.y * b.y,
            a.z * b.z);
    }

    scale(num) {
        this.x *= num;
        this.y *= num;
        this.z *= num;
        return this;
    }

    static scale(a, num) {
        return new Vector3(
            a.x * num,
            a.y * num,
            a.z * num);
    }

    dot(other) {
        return this.x * other.x + this.y * other.y + this.z * other.z;
    }

    cross(other) {
        return new Vector3(
            this.y * other.z - this.z * other.y,
            this.z * other.x - this.x * other.z,
            this.x * other.y - this.y * other.x);
    }

    normalize() {
        return this.scale(1 / this.length());
    }

    static normalized(a) {
        return Vector3.scale(a, 1 / a.length());
    }

    length() {
        return Math.sqrt(this.lengthSquared());
    }

    lengthSquared() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    nearZero() {
        const s = 1e-8;
        return Math.abs(this.x) < s && Math.abs(this.y) < s && Math.abs(this.z) < s;
    }

    reflect(normal) {
        return this.sub(Vector3.scale(normal, 2 * this.dot(normal)));
    }

    static reflect(v, n) {
        return Vector3.sub(v, Vector3.scale(n, 2 * v.dot(n)));
    }

    refract(normal, etaiOverEtat) {
        let cos = Math.min(Vector3.scale(this, -1).dot(normal), 1);
        this.add(Vector3.scale(normal, cos)).scale(etaiOverEtat);
        return this.add(Vector3.scale(normal, -Math.sqrt(Math.abs(1 - this.lengthSquared()))));
    }

    static refract(v, n, etaiOverEtat) {
        let cos = Math.min(Vector3.scale(v, -1).dot(n), 1);
        let rOutPerp = Vector3.scale(Vector3.add(Vector3.scale(n, cos), v), etaiOverEtat);
        let rOutParallel = Vector3.scale(n, -Math.sqrt(Math.abs(1 - rOutPerp.lengthSquared())));
        return rOutPerp.add(rOutParallel);
    }

    static randomOnUnitSphere() {
        let theta = Math.random() * Math.PI * 2;
        let azimuth = Math.random() * Math.PI * 2;
        return new Vector3(Math.sin(theta) * Math.cos(azimuth), Math.sin(theta) * Math.sin(azimuth), Math.cos(theta));
    }

    static randomOnUnitCircle() {
        let theta = Math.random() * Math.PI * 2;
        return new Vector3(Math.cos(theta), Math.sin(theta), 0);
    }

    static randomInUnitCircle() {
        return Vector3.randomOnUnitCircle().scale(Math.random());
    }

    static randomOnHemisphere(normal) {
        let point = Vector3.randomOnUnitSphere();
        if (point.dot(normal) > 0) {
            return point;
        }

        return point.scale(-1);
    }
}

class Ray {
    constructor(origin, direction) {
        this.origin = origin;
        this.direction = direction;
    }

    at(t) {
        return Vector3.add(this.origin, Vector3.scale(this.direction, t));
    }
}

class HitRecord {
    setFaceNormal(ray, outwardNormal) {
        this.frontFace = ray.direction.dot(outwardNormal) < 0;
        this.normal = this.frontFace ? outwardNormal : Vector3.scale(outwardNormal, -1);
    }
}

class Material {
    constructor() {
        if (this.constructor == Material) {
            throw new Error("Material is an abstract class");
        }

        if (this.scatter == undefined) {
            throw new Error("scatter method must be implemented");
        }
    }
}

class Lambertian extends Material {
    constructor(color) {
        super();
        this.color = color;
    }

    scatter(ray, record, attenuation, scattered) {
        let scatterDirection = Vector3.add(record.normal, Vector3.randomOnUnitSphere());
        if (scatterDirection.nearZero())
            scatterDirection = record.normal;

        scattered.origin = record.p;
        scattered.direction = scatterDirection;
        attenuation.r = this.color.r;
        attenuation.g = this.color.g;
        attenuation.b = this.color.b;
        return true;
    }
}

class Metal extends Material {
    constructor(color, fuzz) {
        super();
        this.color = color;
        this.fuzz = fuzz < 1 ? fuzz : 1;
    }

    scatter(ray, record, attenuation, scattered) {
        let reflected = Vector3.reflect(Vector3.normalized(ray.direction), record.normal);
        scattered.origin = record.p;
        scattered.direction = reflected.add(Vector3.randomOnUnitSphere().scale(this.fuzz));
        attenuation.r = this.color.r;
        attenuation.g = this.color.g;
        attenuation.b = this.color.b;
        return scattered.direction.dot(record.normal) > 0;
    }
}

class Dielectric extends Material {
    constructor(ior) {
        super();
        this.ior = ior;
    }

    scatter(ray, record, attenuation, scattered) {
        attenuation.r = 1;
        attenuation.g = 1;
        attenuation.b = 1;
        let refractRatio = record.frontFace ? 1 / this.ior : this.ior;

        let unitDirection = Vector3.normalized(ray.direction);
        let cos = Math.min(Vector3.scale(unitDirection, -1).dot(record.normal), 1);
        let sin = Math.sqrt(1 - cos * cos);
        let cannotRefract = refractRatio * sin > 1;
        if (cannotRefract || Dielectric.#reflectance(cos, this.ior) > Math.random()) {
            unitDirection.reflect(record.normal);
        } else {
            unitDirection.refract(record.normal, refractRatio);
        }

        scattered.origin = record.p;
        scattered.direction = unitDirection;
        return true;
    }

    static #reflectance(cosine, iof) {
        let r0 = (1 - iof) / (1 + iof);
        r0 = r0 * r0;
        return r0 + (1 - r0) * Math.pow(1 - cosine, 5);
    }
}

class Hittable {
    constructor() {
        if (this.constructor == Hittable) {
            throw new Error("Hittabe is an abstract class");
        }

        if (this.hit == undefined) {
            throw new Error("hit method must be implemented");
        }
    }
}

class Sphere extends Hittable {
    constructor(center, radius, material) {
        super();
        this.center = center;
        this.radius = radius;
        this.material = material;
    }

    hit(ray, interval, hitRecord) {
        let oc = Vector3.sub(ray.origin, this.center);
        let a = ray.direction.lengthSquared();
        let halfB = oc.dot(ray.direction);
        let c = oc.lengthSquared() - this.radius * this.radius;

        let discriminant = halfB * halfB - a * c;
        if (discriminant < 0) {
            return false;
        }

        let sqrtDiscrim = Math.sqrt(discriminant);
        let root = (-halfB - sqrtDiscrim) / a;
        if (!interval.surrounds(root)) {
            root = (-halfB + sqrtDiscrim) / a;
            if (!interval.surrounds(root)) {
                return false;
            }
        }

        hitRecord.t = root;
        hitRecord.p = ray.at(hitRecord.t);
        let outwardNormal = (Vector3.sub(hitRecord.p, this.center)).scale(1 / this.radius);
        hitRecord.setFaceNormal(ray, outwardNormal);
        hitRecord.material = this.material;
        return true;
    }
}

class Interval {
    constructor(min, max) {
        this.min = min;
        this.max = max;
    }

    contains(x) {
        return this.min <= x && x <= this.max;
    }

    surrounds(x) {
        return this.min < x && x < this.max;
    }

    clamp(x) {
        if (x < this.min) return this.min;
        if (x > this.max) return this.max;
        return x;
    }
}
