const { resolve } = require("path");
const { readdir, writeFileSync } = require("fs");
const { promisify } = require("util");

const readdirAsync = promisify(readdir);

async function generateBlogRoutes() {
  try {
    const blogDir = resolve(__dirname, "..", "content", "blog");
    const blogFolders = await readdirAsync(blogDir, { withFileTypes: true });

    const blogRoutes = blogFolders
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => `/blog/${dirent.name}`);

    console.log(`Found ${blogRoutes.length} blog post routes:`, blogRoutes);

    // Write the routes to a JSON file
    const outputPath = resolve(__dirname, "..", "data", "blog-routes.json");
    writeFileSync(outputPath, JSON.stringify(blogRoutes, null, 2));

    console.log(`Blog routes written to: ${outputPath}`);
    return blogRoutes;
  } catch (error) {
    console.error("Error generating blog routes:", error);
    return [];
  }
}

generateBlogRoutes();
