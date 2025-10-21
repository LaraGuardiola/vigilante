import fs from "fs";
import selfsigned from "selfsigned";

const attrs = [{ name: "commonName", value: "localhost" }];
const pems = selfsigned.generate(attrs, {
  days: 365,
  keySize: 2048,
  algorithm: "sha256",
  extensions: [
    {
      name: "subjectAltName",
      altNames: [
        { type: 2, value: "localhost" }, // DNS name
        { type: 7, ip: "127.0.0.1" }, // IPv4
        { type: 7, ip: "::1" }, // IPv6
      ],
    },
  ],
});

fs.mkdirSync("certs", { recursive: true });
fs.writeFileSync("certs/cert.pem", pems.cert);
fs.writeFileSync("certs/key.pem", pems.private);

console.log("✅ Certificados creados correctamente en ./certs/");
