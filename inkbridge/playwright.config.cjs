const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({testDir:'tests/desktop',timeout:90000,workers:1,fullyParallel:false,reporter:'list',outputDir:'test-results'});
