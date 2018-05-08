require('dotenv').config();
const request = require('request-promise').defaults({jar: true});
const cheerio = require('cheerio');
const _ = require('underscore');
const moment = require('moment');
const MongoClient = require('mongodb').MongoClient;

// Promise to capture login form verification field
const getVerificationToken = () => {
	return new Promise((resolve, reject) => {
		request({
			uri: 'https://my.switch2.co.uk/Login',
			transform: function (body) {
				return cheerio.load(body);
			}
		}).then(($) => {
			const verificationToken = $('#LoginForm > input').attr('value');
			console.log('loaded login page...');
			resolve(verificationToken);
		}).catch(err => reject(err));
	});
}

// Promise to add session authentication token to cookiejar
const getAuthCookie = (username, password, verificationToken) => {
	return new Promise((resolve, reject) => {
		if(!username || !password || !verificationToken) {
			reject('Missing arguments, requires username, password and token');
		}

		request({
			uri: 'https://my.switch2.co.uk/Login',
			method: 'POST',
			form: {
				__RequestVerificationToken: verificationToken,
				UserName: username,
				Password: password,
			},
			followAllRedirects: true,
			transform: function (body) {
				return cheerio.load(body);
			}
		}).then(($) => {
			console.log('submitted login form...');

			// Capture customer data
			const customer = {
				name: $('.customer-info-name').text(),
				acn: $('.customer-info-account-number').text(),
				address: $('.customer-info-address').text(),
			}

			// If there is customer data, we're logged in
			if(customer.name){
				// Login successful
				resolve(customer);
			} else {
				// no login
				reject('Login not successful')
			}
		}).catch(err => reject(err));
	});
}

const getHistoryData = () => {
	return new Promise((resolve, reject) => {
		request({
			uri: `https://my.switch2.co.uk/MeterReadings/History`,
		  transform: function (body) {
		    return cheerio.load(body);
		  }
		}).then(($) => {
			const records = [];
			// transform the data
			$('.meter-reading-history-table-data-row.desktop-layout').each(function(i, elem) {
				const date = moment.utc($(this).find('.meter-reading-history-table-data-date-row-item').text(), 'Do MMM YYYY').toDate();
				const amount = parseInt($(this).find('.meter-reading-history-table-data-amount-row-item').text());
				records.push({
					date,
					amount,
				});
			});

			// Log how many were found
			console.log(`Found ${records.length} records...`)
			resolve(records);
		}).catch(err => reject(err));
	});
}

const writeRecordsToDb = (records) => {
	return new Promise((resolve, reject) => {
		if(!records) reject('no records');
		const url  = process.env.MONGO_URL;
		if(!url) reject('no mongo url found');
		// Connect to DB
		MongoClient.connect(url, (err, database) => {
			if(err) {
				reject(err);
			}

			const results = [];
			const collection = database.collection('records');
			console.log('connected to db, pushing records...');
			_.each(records, (record) => {
				// Upsert if the record does not exist yet
				collection.update({date: record.date}, record, { upsert: true }, (err, result) => {
					if(err) reject(err);
					// Record updated
					console.log(`Updated ${record.date} to ${record.amount}`);
					results.push(result);
					//
					if(records.indexOf(record) + 1 === records.length) {
						console.log('Completed writing records');
						database.close();
						resolve(results);
			    }
				});
			});
		});
	});
}

// AWS Lambda function handler
exports.handler = async (event, context, callback) => {
	// Load in credentials
	if(!process.env.USERNAME || !process.env.PASSWORD){
		callback('Missing credentials')
	}
	const username = process.env.USERNAME;
	const password = process.env.PASSWORD;

	// Start the login
	console.log('starting function...');

	try {
		// Get verification token from login page
		const verificationToken = await getVerificationToken();
		const customer = await getAuthCookie(username, password, verificationToken);
		const records = await getHistoryData();
		const entries = await writeRecordsToDb(records);
		// Callback with records
		callback(null, records);
	} catch (err) {
		// Catch any errors
		console.error(err);
		callback(err)
	}
}
