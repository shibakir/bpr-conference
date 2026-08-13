import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
    allowedDevOrigins: ["*.*.*.*"], // allow all connections inside local network
    //allowedDevOrigins: ["192.168.0.*"],
    output: "standalone",
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
