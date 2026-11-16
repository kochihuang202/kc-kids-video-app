# 0.7.0 整合進度（尚未發布）
2026-11-16：同步／ZIP更新／清理整合仍在驗收，禁止將目前工作樹當成已完成版發布或刪 OneDrive 舊包。
通過：16項同步/保留/診斷/排序/交付測試；7項lineage及ZIP-only完整fallback、delta優先、拒絕壞包、健康失敗回復；check-seamless-sync實際原視窗接力與真衝突保留。
尚未通過：check-sync-settings.cjs最後一筆中文在手動還原前的備份保存證明。已能自動掃描、到達刷新、排序、直接還原並建立forward節點。最後內容證明不成立，可能fixture的原生textbox沒有取得實際編輯焦點，也可能保存屏障有缺陷；不可削弱斷言。下一步擷取編輯器DOM/焦點/flush前後graph與SQLite，再定位。
新的同步記錄永久獨立lineage；舊基準c400…的遺失關係仍不可按時間推定。不能宣稱已在另一台實際完成接續。
新增verifyReleaseZip完整串流驗證尚未實作（release-zip.cjs目前只有readZipEnvelope）；deliver-release.cjs刪舊包前尚需這項或實際stage完整驗證作前置。
所有變更僅合成暫存資料，未修改正式筆記，未放新包OneDrive，未刪舊包。
