var Test = require("../config/testConfig.js");
// var BigNumber = require('bignumber.js');
var Web3 = require("web3");
// const web3 = new Web3(ganache.provider());

contract("Flight Surety Tests", async (accounts) => {
  const TEST_ORACLES_COUNT = 20;
  const STATUS_CODE_LATE_AIRLINE = 20;
  var config;
  var flightTimestamp;

  before("setup contract", async () => {
    config = await Test.Config(accounts);
    await config.flightSuretyData.authorizeCaller(
      config.flightSuretyApp.address,
      { from: accounts[0] }
    );
  });

  /****************************************************************************************/
  /* Operations and Settings                                                              */
  /****************************************************************************************/

  it(`App contract is authorized by Data contract`, async function () {
    // Get operating status
    let status = await config.flightSuretyData.isAuthorized.call(
      config.flightSuretyApp.address
    );
    assert.equal(status, true, "App contract should be authorized");
  });

  it(`(multiparty) has correct initial isOperational() value`, async function () {
    // Get operating status
    let status = await config.flightSuretyData.isOperational.call();
    assert.equal(status, true, "Incorrect initial operating status value");
  });

  it(`(multiparty) can block access to setOperatingStatus() for non-Contract Owner account`, async function () {
    // Ensure that access is denied for non-Contract Owner account
    let accessDenied = false;
    try {
      await config.flightSuretyData.setOperatingStatus(false, {
        from: config.testAddresses[2],
      });
    } catch (e) {
      accessDenied = true;
    }
    assert.equal(accessDenied, true, "Access not restricted to Contract Owner");
  });

  it(`(multiparty) can allow access to setOperatingStatus() for Contract Owner account`, async function () {
    // Ensure that access is allowed for Contract Owner account
    let accessDenied = false;
    try {
      await config.flightSuretyData.setOperatingStatus(false);
    } catch (e) {
      accessDenied = true;
    }
    assert.equal(
      accessDenied,
      false,
      "Access not restricted to Contract Owner"
    );
  });

  it(`(multiparty) can block access to functions using requireIsOperational when operating status is false`, async function () {
    await config.flightSuretyData.setOperatingStatus(false);

    let reverted = false;
    try {
      await config.flightSurety.setTestingMode(true);
    } catch (e) {
      reverted = true;
    }
    assert.equal(reverted, true, "Access not blocked for requireIsOperational");

    // Set it back for other tests to work
    await config.flightSuretyData.setOperatingStatus(true);
  });

  it("Contract owner is registered as an airline when contract is deployed", async () => {
    let airlinesCount = await config.flightSuretyData.airlinesCount.call();
    let isAirline = await config.flightSuretyData.isRegistered.call(
      accounts[0]
    );
    assert.equal(
      isAirline,
      true,
      "First airline should be registired at contract deploy."
    );
    assert.equal(
      airlinesCount,
      1,
      "Airlines count should be one after contract deploy."
    );
  });

  it("(airline) can register an Airline using registerAirline() directly without need of a consensus", async () => {
    // ARRANGE
    let funds = await config.flightSuretyData.MINIMUM_FUNDS.call();
    let result = false;
    // ACT
    try {
      await config.flightSuretyData.fund({
        from: config.firstAirline,
        value: funds,
      });
      await config.flightSuretyApp.registerAirline(
        accounts[2],
        "dummy airline 2 name",
        { from: accounts[0] }
      );
    } catch (e) {
      console.log(e);
    }
    let airlinesCount = await config.flightSuretyData.airlinesCount.call();
    result = await config.flightSuretyData.isRegistered.call(accounts[2]);
    // ASSERT
    assert.equal(
      result,
      true,
      "Airline should be able to register another airline directly if there are less than 4 registered"
    );
    assert.equal(
      airlinesCount,
      2,
      "Airlines count should be one after contract deploy."
    );
  });

  it("(airline) needs 50% votes to register an Airline using registerAirline() once there are 4 or more airlines registered", async () => {
    let resultPreConsensus = true;
    let resultPostConsensus = false;
    // ACT
    try {
      await config.flightSuretyApp.registerAirline(
        accounts[3],
        "dummy airline 3 name",
        { from: config.firstAirline }
      );
      await config.flightSuretyApp.registerAirline(
        accounts[4],
        "dummy airline 4 name",
        { from: config.firstAirline }
      );
      await config.flightSuretyApp.registerAirline(
        accounts[5],
        "dummy airline 5 name",
        { from: config.firstAirline }
      );
      resultPreConsensus = await config.flightSuretyData.isRegistered.call(
        accounts[6]
      );
      await config.flightSuretyData.submitAirlineVote(accounts[5], {
        from: accounts[2],
      });
      await config.flightSuretyData.submitAirlineVote(accounts[5], {
        from: accounts[3],
      });
      await config.flightSuretyApp.registerAirline(
        accounts[5],
        "dummy airline 5 name",
        { from: accounts[0] }
      );
      resultPostConsensus = await config.flightSuretyData.isRegistered.call(
        accounts[5]
      );
    } catch (e) {
      console.log(e);
    }

    // ASSERT
    assert.equal(
      resultPreConsensus,
      false,
      "This Airline needs 50% votes to register an Airline"
    );
    assert.equal(resultPostConsensus, true, "This Airline passed consensus");
  });

  it("(airline) can register a flight using registerFlight()", async () => {
    // ARRANGE
    flightTimestamp = Math.floor(Date.now() / 1000); //convert timestamp from miliseconds (javascript) to seconds (solidity)

    // ACT
    try {
      await config.flightSuretyApp.registerFlight("ND1309", flightTimestamp, {
        from: config.firstAirline,
      });
    } catch (e) {
      console.log(e);
    }
  });

  it("(passenger) may pay up to 1 ether for purchasing flight insurance.", async () => {
    // ARRANGE
    let price = await config.flightSuretyData.MAX_INSURANCE_AMT_LIMIT.call();

    // ACT
    try {
      await config.flightSuretyData.buy("ND1309", {
        from: config.samplePassenger,
        value: price,
      });
    } catch (e) {
      console.log(e);
    }

    let registeredPassenger =
      await config.flightSuretyData.isExistingPassenger.call(
        config.samplePassenger
      );
    assert.equal(
      registeredPassenger,
      true,
      "Passenger should be added to list of people who bought a ticket."
    );
  });

  it("Upon startup, 20+ oracles are registered and their assigned indexes are persisted in memory", async () => {
    // ARRANGE
    let fee = await config.flightSuretyApp.REGISTRATION_FEE.call();

    // ACT
    for (let a = 0; a < TEST_ORACLES_COUNT; a++) {
      await config.flightSuretyApp.registerOracle({
        from: accounts[a],
        value: fee,
      });
      let result = await config.flightSuretyApp.getMyIndexes.call({
        from: accounts[a],
      });
      assert.equal(
        result.length,
        3,
        "Oracle should be registered with three indexes"
      );
    }
  });

  it("Server will loop through all registered oracles, identify those oracles for which the OracleRequest event applies, and respond by calling into FlightSuretyApp contract with random status code", async () => {
    // ARRANGE
    let flight = "ND1309";
    let timestamp = Math.floor(Date.now() / 1000); //convert timestamp from miliseconds (javascript) to seconds (solidity)

    // Submit a request for oracles to get status information for a flight
    await config.flightSuretyApp.fetchFlightStatus(
      config.firstAirline,
      flight,
      timestamp
    );

    for (let a = 0; a < TEST_ORACLES_COUNT; a++) {
      let oracleIndexes = await config.flightSuretyApp.getMyIndexes({
        from: accounts[a],
      });
      for (let idx = 0; idx < 3; idx++) {
        try {
          // Submit a response...it will only be accepted if there is an Index match
          await config.flightSuretyApp.submitOracleResponse(
            oracleIndexes[idx],
            config.firstAirline,
            flight,
            timestamp,
            STATUS_CODE_LATE_AIRLINE,
            { from: accounts[a] }
          );
          console.log(
            "\nSuccess",
            idx,
            oracleIndexes[idx].toNumber(),
            flight,
            flightTimestamp
          );
        } catch (e) {
          //  console.log(e);
          // console.log(
          //   "\nError",
          //   idx,
          //   oracleIndexes[idx].toNumber(),
          //   flight,
          //   flightTimestamp
          // );
        }
      }
    }
    let flightStatus = await config.flightSuretyApp.viewFlightStatus(
      flight,
      config.firstAirline
    );
    assert.equal(
      STATUS_CODE_LATE_AIRLINE,
      flightStatus.toString(),
      "Oracles should changed flight status to 20 (late due to Airline)"
    );
  });

  it("(passenger) receives credit of 1.5X the amount they paid, if flight is delayed due to airline fault", async () => {
    // ARRANGE
    let price = await config.flightSuretyData.MAX_INSURANCE_AMT_LIMIT.call();
    let creditToPay = await config.flightSuretyData.getPayableCredit.call({
      from: config.samplePassenger,
    });
    const creditInWei = price * 1.5;
    assert.equal(
      creditToPay,
      creditInWei,
      "Passenger should have 1,5 ether to withdraw."
    );
  });

  it("(passenger) can withdraw any funds owed to them as a result of receiving credit for insurance payout", async () => {
    let creditToPay = await config.flightSuretyData.getPayableCredit.call({
      from: config.samplePassenger,
    });

    let passengerOriginalBalance = await web3.eth.getBalance(
      config.samplePassenger
    );
    await config.flightSuretyData.pay(config.samplePassenger);
    let passengerFinalBalance = await web3.eth.getBalance(
      config.samplePassenger
    );

    let finalCredit = await config.flightSuretyData.getPayableCredit.call({
      from: config.samplePassenger,
    });

    assert.equal(
      finalCredit.toString(),
      0,
      "Passenger should have transfered the ethers to its wallet."
    );
    assert.equal(
      Number(passengerOriginalBalance) + Number(creditToPay),
      Number(passengerFinalBalance),
      "Passengers balance should have increased the amount it had credited"
    );
  });
});
