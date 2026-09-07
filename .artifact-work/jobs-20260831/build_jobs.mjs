import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "C:/Users/13575/Desktop";
const outputPath = `${outputDir}/2027届成都技术岗投递清单_20岗_2026-08-31.xlsx`;
const previewPath = `${outputDir}/2027届成都技术岗投递清单_预览.png`;

const jobs = [
  [1, "S", "金证科技", "Web前端开发工程师", "前端", "27届秋招", "成都（公告城市）", "官网需确认具体HC", "本科及以上", "2026-08-20", "2026-11-30", "高", 96, "金融科技Java/前端岗位量较大；你的ElfUI、Vite插件和工程化经历辨识度高。", "https://szkingdom.zhiye.com/campus", "https://career.sustech.edu.cn/detail/online?id=3574848", "未投", "使用前端版简历，首投"],
  [2, "S", "超星集团", "前端开发工程师", "前端", "27届秋招", "成都", "公开JD明确成都", "本科及以上", "2026-08-24", "尽快投递", "高", 95, "Vue、TypeScript、Vite与低代码/编辑器经验高度匹配；不要求名校标签。", "mailto:meiqing@aichaoxing.com", "https://www.wondercv.com/xiaozhao/chaoxing-2027-campus-recruitment-12839-94b969/", "未投", "使用前端版简历，首投"],
  [3, "S", "嘉为科技", "前端开发工程师", "前端", "27届秋招/实习转正", "成都（公告城市）", "岗位城市需官网确认", "本科及以上", "2026-08-22", "2026-10-20", "高", 93, "DevOps/AIOps平台重工程化；你的组件库、CLI、LSP和构建工具经历很适合。", "mailto:canwaycr@canway.net", "https://jy.htu.edu.cn/detail/online?id=3522943&menu_id=", "未投", "前端版简历，邮件投递"],
  [4, "A", "易点云", "前端开发", "前端", "27届秋招", "成都（公告城市）", "官网需确认具体HC", "本科/硕士", "2026-08-20", "尽快（聚合站截止不一致）", "高", 91, "SaaS/企业服务场景，重实际交付；学校门槛相对温和。", "https://recruit-pro.edianyun.com/#/wap/recruitment-collect", "https://jobs.niuqizp.com/schedule-7ywYN5NZN.html", "未投", "前端版简历，优先投"],
  [5, "S", "海艺科技", "WEB前端开发工程师", "前端", "27届秋招", "成都", "成都本地岗位", "本科及以上", "2026-08-30", "招满即止", "高", 96, "AI应用产品+前端工程化，与你的前端底子和Agent学习路线高度契合。", "https://app.mokahr.com/campus-recruitment/haiyi/150699?locale=zh-CN#/jobs", "https://jvcit.bysjy.com.cn/detail/online?id=3575592", "未投", "前端版简历，首投"],
  [6, "A", "海能达", "Web前端开发工程师", "前端", "27届秋招", "成都（公告城市）", "官网需确认具体HC", "本科及以上", "2026-08-27", "尽快投递", "中", 86, "通信行业研发中心；前端岗位明确存在，但多城市公告未逐岗映射。", "https://www.hyt.com/join-us", "https://career.hit.edu.cn/file/20250905/1757055604666056790.pdf", "未投", "先在官网确认成都HC"],
  [7, "A", "顺丰科技", "前端开发工程师", "前端", "27届提前批", "成都", "公开简章列明成都", "本科及以上", "2026-08-14", "2026-10-12", "中", 88, "平台好、技术体系完整，但竞争强；你的工程化项目可形成差异化。", "https://campus.sf-express.com/", "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=dd2c9de3d20e401e864a28b96ba06d16", "未投", "冲刺，提前准备笔试"],
  [8, "A", "招银网络科技", "前端开发工程师", "前端", "27届秋招", "成都", "公开简章明确成都", "本科及以上/STEM", "2026-07-30", "2026-09-20 18:00", "中", 90, "成都研发中心、岗位明确；银行科技竞争较强，但没有公开985/211限制。", "https://cmbnt.cmbchina.com/", "https://career.hebut.edu.cn/home/correcruit/content/id/79061.html", "未投", "第二批截止早，立即投"],
  [9, "A", "安泉数智", "前端工程师（实习）", "前端", "27届日常实习", "成都（部分岗位）", "需确认前端是否成都HC", "本科/硕士/博士在校", "2026-06-26", "招满即止", "高", 92, "适合补实习空白，可转正；要求稳定实习约6个月，先确认论文安排。", "https://hicv.cn/xiaozhao/anquan-shuzhi-2027-internship-11260-ccfcb9", "https://hicv.cn/xiaozhao/anquan-shuzhi-2027-internship-11260-ccfcb9", "未投", "能实习6个月再投"],
  [10, "S", "金证科技", "Java开发工程师", "Java后端", "27届秋招", "成都", "公开简章列明成都", "本科及以上", "2026-08-20", "2026-11-30", "高", 95, "约35个Java需求；CourseMall、Spring Boot、Redis、安全认证与金融业务容易包装。", "https://szkingdom.zhiye.com/campus", "https://career.sustech.edu.cn/detail/online?id=3574848", "未投", "Java版简历，首投"],
  [11, "S", "超星集团", "Java开发工程师", "Java后端", "27届秋招", "成都", "公开JD明确成都", "本科及以上", "2026-08-24", "尽快投递", "高", 94, "Spring Boot、MySQL、Redis并希望会Vue；你的前后端组合正好匹配。", "mailto:meiqing@aichaoxing.com", "https://career.nankai.edu.cn/correcruit/content/id/115293.html", "未投", "Java版简历，首投"],
  [12, "S", "嘉为科技", "后端开发工程师", "Java后端", "27届秋招/实习转正", "成都（公告城市）", "岗位城市需官网确认", "本科及以上", "2026-08-22", "2026-10-20", "高", 92, "Spring Boot/微服务/DevOps方向，项目导向强；公开要求未限定学校层次。", "mailto:canwaycr@canway.net", "https://www.wondercv.com/xiaozhao/jiawei-tech-2027-campus-recruitment-12831-ff3845/", "未投", "Java版简历，优先投"],
  [13, "A", "易点云", "Java技术", "Java后端", "27届秋招", "成都（公告城市）", "官网需确认具体HC", "本科/硕士", "2026-08-20", "尽快（聚合站截止不一致）", "高", 89, "企业服务/SaaS后端，偏业务工程实践；对项目完成度比学校标签更敏感。", "https://recruit-pro.edianyun.com/#/wap/recruitment-collect", "https://jobs.niuqizp.com/schedule-7ywYN5NZN.html", "未投", "Java版简历，优先投"],
  [14, "A", "海艺科技", "后端开发工程师", "Java后端", "27届秋招", "成都", "成都本地岗位", "本科及以上", "2026-08-30", "招满即止", "中高", 91, "AI产品后端，语言可能不只Java；突出Java服务、接口设计和前端协作能力。", "https://app.mokahr.com/campus-recruitment/haiyi/150699?locale=zh-CN#/jobs", "https://jvcit.bysjy.com.cn/detail/online?id=3575592", "未投", "Java/全栈版简历"],
  [15, "A", "海艺科技", "Agent开发工程师", "AI应用/全栈", "27届秋招", "成都", "成都本地岗位", "本科及以上", "2026-08-30", "招满即止", "中", 87, "与你后续QA-Agent项目契合，但当前基础不足；可先投，面试前补RAG/Agent最小项目。", "https://app.mokahr.com/campus-recruitment/haiyi/150699?locale=zh-CN#/jobs", "https://jvcit.bysjy.com.cn/detail/online?id=3575592", "未投", "冲刺；两周内补Agent Demo"],
  [16, "A", "电科金仓", "Java研发工程师", "Java后端", "27届秋招", "成都", "岗位明确为成都", "硕士及以上", "2026-08-25", "2026-10-23", "中高", 90, "学历完全匹配且未写985/211；偏数据库工具研发，需要补SQL、JDBC和数据库原理。", "https://app.mokahr.com/campus-recruitment/kingbase/47259#/", "https://www.shushuqiuzhi.com/position/452685", "未投", "重点投；补数据库原理"],
  [17, "A", "星环科技", "后端开发工程师", "Java后端", "27届秋招", "成都", "公开简章列明成都", "本科/硕士/博士", "2026-08-25", "2026-12-31", "中", 86, "企业级数据库/大数据平台，技术含金量高，但笔试和分布式基础门槛更高。", "https://app.mokahr.com/campus_apply/transwarp", "https://career.nankai.edu.cn/correcruit/content/id/116990.html", "未投", "冲刺；准备算法与分布式"],
  [18, "A", "顺丰科技", "Java开发工程师", "Java后端", "27届提前批", "成都", "公开简章列明成都", "本科及以上", "2026-08-14", "2026-10-12", "中", 88, "物流高并发业务与CourseMall技术栈接近；竞争强，需补算法、Redis和消息队列。", "https://campus.sf-express.com/", "https://jdjyw.jlu.edu.cn/mportal/recruit/details?id=dd2c9de3d20e401e864a28b96ba06d16", "未投", "冲刺，准备笔试"],
  [19, "A", "安泉数智", "Java开发工程师（实习）", "Java后端", "27届日常实习", "成都（部分岗位）", "需确认Java是否成都HC", "本科/硕士/博士在校", "2026-06-26", "招满即止", "高", 91, "补足无实习短板，项目/竞赛优先而非学校标签；要求连续稳定实习约6个月。", "https://hicv.cn/xiaozhao/anquan-shuzhi-2027-internship-11260-ccfcb9", "https://hicv.cn/xiaozhao/anquan-shuzhi-2027-internship-11260-ccfcb9", "未投", "能实习6个月再投"],
  [20, "B", "华诺星空", "JAVA开发工程师（AI应用方向）", "AI应用/Java", "27届秋招", "成都（公司城市）", "当前公开岗位地点需复核", "本科及以上", "2026-08-24", "2026-10-20", "中", 80, "普通Java岗未公开限制学校；不要报明确偏名校的“领航计划”，且先确认成都HC。", "https://app.mokahr.com/m/campus-recruitment/novasky/146544?locale=zh-CN", "https://myjob.dlmu.edu.cn/campus/view/id/868428", "未投", "确认成都HC后再投"],
];

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("投递清单");
sheet.showGridLines = false;

sheet.getRange("A1:R1").merge();
sheet.getRange("A1").values = [["2027届成都技术岗投递清单（20岗）"]];
sheet.getRange("A2:R2").merge();
sheet.getRange("A2").values = [["截至 2026-08-31｜前端优先，兼顾 Java 后端与 AI 应用｜“双非友好度”为公开 JD 推断，不代表企业承诺不卡学校"]];

sheet.getRange("A4:A5").merge();
sheet.getRange("A4").values = [["岗位总数"]];
sheet.getRange("B4:B5").merge();
sheet.getRange("B4").formulas = [["=COUNTA(C9:C28)"]];
sheet.getRange("D4:D5").merge();
sheet.getRange("D4").values = [["前端岗位"]];
sheet.getRange("E4:E5").merge();
sheet.getRange("E4").formulas = [["=COUNTIF(E9:E28,\"前端\")"]];
sheet.getRange("G4:G5").merge();
sheet.getRange("G4").values = [["实习岗位"]];
sheet.getRange("H4:H5").merge();
sheet.getRange("H4").formulas = [["=COUNTIF(F9:F28,\"27届日常实习\")"]];
sheet.getRange("J4:J5").merge();
sheet.getRange("J4").values = [["已投数量"]];
sheet.getRange("K4:K5").merge();
sheet.getRange("K4").formulas = [["=COUNTIF(Q9:Q28,\"已投\")+COUNTIF(Q9:Q28,\"笔试\")+COUNTIF(Q9:Q28,\"面试\")"]];
sheet.getRange("M4:R5").merge();
sheet.getRange("M4").values = [["投递策略：同一公司优先选择最匹配的 1 个岗位；前端版突出 ElfUI/CLI/LSP/Vite，Java版突出 CourseMall/Spring Boot/Security/Redis。"]];

const headers = [["序号", "优先级", "公司", "岗位", "方向", "招聘类型", "工作地点", "城市可信度", "学历", "发布时间", "截止时间", "双非友好度", "推荐分", "匹配理由 / 风险", "投递入口", "信息来源", "投递状态", "下一步"]];
sheet.getRange("A8:R8").values = headers;
sheet.getRange("A9:R28").values = jobs;

const table = sheet.tables.add("A8:R28", true, "JobApplications");
table.style = "TableStyleMedium2";
table.showFilterButton = true;

sheet.getRange("Q9:Q28").dataValidation = {
  rule: { type: "list", values: ["未投", "已投", "笔试", "面试", "Offer", "放弃", "结束"] },
};

sheet.getRange("A1:R1").format = {
  fill: "#17324D",
  font: { name: "Microsoft YaHei", size: 18, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("A1:R1").format.rowHeight = 34;
sheet.getRange("A2:R2").format = {
  fill: "#EAF2F8",
  font: { name: "Microsoft YaHei", size: 10, color: "#36566F" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
sheet.getRange("A2:R2").format.rowHeight = 30;

for (const labelRange of ["A4:A5", "D4:D5", "G4:G5", "J4:J5"]) {
  sheet.getRange(labelRange).format = {
    fill: "#DCEAF3",
    font: { bold: true, color: "#36566F" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
  };
}
for (const valueRange of ["B4:B5", "E4:E5", "H4:H5", "K4:K5"]) {
  sheet.getRange(valueRange).format = {
    fill: "#FFFFFF",
    font: { size: 16, bold: true, color: "#0F766E" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    borders: { preset: "outside", style: "thin", color: "#B7C9D6" },
  };
}
sheet.getRange("M4:R5").format = {
  fill: "#FFF7E6",
  font: { color: "#8A5A00" },
  wrapText: true,
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#E6C878" },
};

sheet.getRange("A8:R8").format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  wrapText: true,
};
sheet.getRange("A9:R28").format = {
  font: { name: "Microsoft YaHei", size: 10, color: "#1F2937" },
  verticalAlignment: "center",
};
sheet.getRange("A9:M28").format.horizontalAlignment = "center";
sheet.getRange("N9:R28").format.wrapText = true;
sheet.getRange("N9:N28").format.horizontalAlignment = "left";
sheet.getRange("O9:P28").format.horizontalAlignment = "left";
sheet.getRange("R9:R28").format.horizontalAlignment = "left";
sheet.getRange("J9:J28").format.numberFormat = "yyyy-mm-dd";

sheet.getRange("B9:B28").conditionalFormats.add("containsText", { text: "S", format: { fill: "#D1FAE5", font: { bold: true, color: "#065F46" } } });
sheet.getRange("B9:B28").conditionalFormats.add("containsText", { text: "A", format: { fill: "#DBEAFE", font: { bold: true, color: "#1E40AF" } } });
sheet.getRange("B9:B28").conditionalFormats.add("containsText", { text: "B", format: { fill: "#FEF3C7", font: { bold: true, color: "#92400E" } } });
sheet.getRange("Q9:Q28").conditionalFormats.add("containsText", { text: "已投", format: { fill: "#DBEAFE", font: { color: "#1E40AF" } } });
sheet.getRange("Q9:Q28").conditionalFormats.add("containsText", { text: "面试", format: { fill: "#D1FAE5", font: { bold: true, color: "#065F46" } } });
sheet.getRange("Q9:Q28").conditionalFormats.add("containsText", { text: "Offer", format: { fill: "#FCE7F3", font: { bold: true, color: "#9D174D" } } });

const widths = {
  A: 6, B: 8, C: 16, D: 24, E: 15, F: 17, G: 18, H: 23, I: 18,
  J: 13, K: 23, L: 13, M: 10, N: 42, O: 39, P: 42, Q: 13, R: 26,
};
for (const [col, width] of Object.entries(widths)) {
  sheet.getRange(`${col}:${col}`).format.columnWidth = width;
}
sheet.getRange("8:8").format.rowHeight = 34;
sheet.getRange("9:28").format.rowHeight = 48;
sheet.freezePanes.freezeRows(8);
sheet.freezePanes.freezeColumns(3);

const check = await workbook.inspect({
  kind: "table",
  range: "投递清单!A1:R28",
  include: "values,formulas",
  tableMaxRows: 28,
  tableMaxCols: 18,
  maxChars: 12000,
});
console.log(check.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

const preview = await workbook.render({
  sheetName: "投递清单",
  range: "A1:R28",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

await fs.mkdir(outputDir, { recursive: true });
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath }));
