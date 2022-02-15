import { Builder, By } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome";
import { GoogleSpreadsheet } from "google-spreadsheet";
import cron from "node-cron";
import TelegramBot from "node-telegram-bot-api";
import dotenv from "dotenv";

dotenv.config();

const builder = new Builder();
const option = new Options()
	.addArguments("--headless")
	.addArguments(`user-data-dir=${process.env.USRE_DATA_DIR}`);

const doc = new GoogleSpreadsheet(process.env.SHEET_ID);

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN!);
const chatId = process.env.CHAT_ID!;

async function works() {
	console.info("run");
	await doc.useServiceAccountAuth({
		// env var values are copied from service account credentials generated by google
		// see "Authentication" section in docs for more info
		client_email: process.env.CLIENT_EMAIL!,
		private_key: process.env.PRIVATE_KEY!,
	});

	let driver = await builder
		.forBrowser("chrome")
		.setChromeOptions(option)
		.build();

	try {
		await driver.get(
			"https://m.cafe.naver.com/ca-fe/web/cafes/ronaronakr/articles/2476?useCafeId=false"
		);

		await driver.wait(() => {}, 3000).catch((e) => console.error(e));

		const root = await driver.findElements(By.className("poll_list_item"));

		if (root.length <= 0) {
			throw new Error("fetch Error");
		}

		const results = await Promise.all(
			root.map(async (element) => {
				const name = await element
					.findElement(By.className("poll_label"))
					.getText();
				const voted = Number(
					(await element.findElement(By.className("txt")).getText())
						.split(",")[0]
						.replace("표", "")
				);

				return {
					name,
					voted,
				};
			})
		);

		const currentDate = new Date();

		await doc.loadInfo();
		await doc.updateProperties({
			title: `로나 유니버스 득표 결과 - ${currentDate}}`,
		});

		const sheet = doc.sheetsByIndex[1]; // the first sheet

		await sheet.setHeaderRow([
			"이름", // A
			"득표 수", // B
			"조", // C
			"직전 랭킹", // D
			"랭킹", // E
			"수집시간", // F
			"변동(1시간 전과 비교)", // G
		]);

		await sheet.loadCells(`A2:F${results.length + 2}`);

		for (let i = 0; i < results.length; i++) {
			const nameCell = sheet.getCellByA1(`A${i + 2}`);
			nameCell.value = results[i].name;

			const rankCell = sheet.getCellByA1(`E${i + 2}`);

			const oldRankCell = sheet.getCellByA1(`D${i + 2}`);
			oldRankCell.value = rankCell.value;

			const votedCell = sheet.getCellByA1(`B${i + 2}`);
			votedCell.value = results[i].voted;

			const dateCell = sheet.getCellByA1(`F${i + 2}`);
			dateCell.value = currentDate.toString();
		}

		await sheet.saveUpdatedCells();

		await bot
			.sendMessage(chatId, "[lona crawler] crawling Done")
			.catch((e) => console.error(e));
		console.info("done");
	} catch (e) {
		await bot
			.sendMessage(chatId, `[lona crawler] ${(e as Error).message}`)
			.catch((e) => console.error(e));
	} finally {
		await driver.quit().catch((e) => console.error(e));
	}
}

cron.schedule("00 00 * * * *", works);
// works();
