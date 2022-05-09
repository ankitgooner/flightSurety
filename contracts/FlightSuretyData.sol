pragma solidity >=0.5.0;

import "../node_modules/openzeppelin-solidity/contracts/math/SafeMath.sol";

contract FlightSuretyData {
    using SafeMath for uint256;

    /********************************************************************************************/
    /*                                       DATA VARIABLES                                     */
    /********************************************************************************************/

    struct Airline {
        address airline;
        bool isRegistered;
        bool isAdded;
        string name;
        uint256 funds;
        uint256 votes;
    }
    address private contractOwner; // Account used to deploy contract
    mapping(address => uint256) private authorizedContracts;
    bool private operational = true; // Blocks all state changes throughout the contract if false
    mapping(address => Airline) public airlines;
    mapping(address => address[]) airlineVotes; //maintian the votes for an airline
    uint256 public airlinesCount; //total airlines registered so far
    uint256 totalFunds = 0;

    struct Passenger {
        bool isExisting;
        address passengerWallet;
        mapping(string => uint256) insuredFlights;
        uint256 credit;
    }

    mapping(address => Passenger) private passengers;
    address[] public passengerAddresses;

    uint8 private constant MIN_AIRLINE_LIMIT = 4;
    uint256 public constant MINIMUM_FUNDS = 10 ether;
    uint256 public constant MAX_INSURANCE_AMT_LIMIT = 1 ether;

    /********************************************************************************************/
    /*                                       EVENT DEFINITIONS                                  */
    /********************************************************************************************/

    /**
     * @dev Constructor
     *      The deploying account becomes contractOwner
     */
    constructor() public {
        contractOwner = msg.sender;
        airlinesCount = 0;
        
        airlines[msg.sender] = Airline({
            airline: msg.sender,
            isRegistered: true,
            isAdded: true,
            name: "First Airline",
            funds: 0,
            votes: 0
        });
        airlinesCount++;
    }

    /********************************************************************************************/
    /*                                       FUNCTION MODIFIERS                                 */
    /********************************************************************************************/

    // Modifiers help avoid duplication of code. They are typically used to validate something
    // before a function is allowed to be executed.

    /**
     * @dev Modifier that requires the "operational" boolean variable to be "true"
     *      This is used on all state changing functions to pause the contract in
     *      the event there is an issue that needs to be fixed
     */
    modifier requireIsOperational() {
        require(operational, "Contract is currently not operational");
        _; // All modifiers require an "_" which indicates where the function body will be added
    }

    /**
     * @dev Modifier that requires the "ContractOwner" account to be the function caller
     */

    modifier requireContractOwner() {
        require(msg.sender == contractOwner, "Caller is not contract owner");
        _;
    }

    modifier requireIsRegistered() {
        require(
            airlines[msg.sender].isRegistered,
            "Calling airline is not registered"
        );
        _;
    }

    modifier requireNotRegistred(address airline) {
        require(!airlines[airline].isRegistered, " airline already registered");
        _;
    }

modifier requireFunded(address airline) {
        require(airlines[airline].isRegistered, " airline already registered");
        _;
    }
    modifier requireIsAirlineActive() {
        require(isActive(msg.sender), " airline not active");
        _;
    }

    modifier requireInsuredPassenger(address passenger) {
        require(passengers[passenger].isExisting, "passenger is not insured");
        _;
    }

    /********************************************************************************************/
    /*                                       UTILITY FUNCTIONS                                  */
    /********************************************************************************************/

    /**
     * @dev Get operating status of contract
     *
     * @return A bool that is the current operating status
     */
    function isOperational() public view returns (bool) {
        return operational;
    }

    function isActive(address airline) public view returns (bool) {
        return (airlines[airline].funds >= MINIMUM_FUNDS);
    }

    function isRegistered(address airline) public view returns (bool) {
        return airlines[airline].isRegistered;
    }

    function isExistingPassenger(address passenger) public view returns (bool) {
       return passengers[passenger].isExisting;
    }

    function getAirlineVotes(address airline) public view returns (uint256) {
        return airlines[airline].votes;
    }

function getRegisteredAirlineCount() public view returns (uint256) {
        return airlinesCount;
    }

     function getPayableCredit() external view returns (uint256) {
        return passengers[msg.sender].credit;
    }
    /**
     * @dev Sets contract operations on/off
     *
     * When operational mode is disabled, all write transactions except for this one will fail
     */
    function setOperatingStatus(bool mode) external requireContractOwner {
        operational = mode;
    }

    /********************************************************************************************/
    /*                                     SMART CONTRACT FUNCTIONS                             */
    /********************************************************************************************/

    /**
    Method to submite vote for an airline , checks whether an airline is registered to vote and is not voting multiple times.
    */
    function submitAirlineVote(address airline)
        external
        requireIsOperational
        requireIsRegistered
    {
        bool isDuplicateVote = false;
        uint256 len = airlineVotes[airline].length;
        for (uint256 i = 0; i < len; i++) 
        {
            if(airlineVotes[airline][i] == msg.sender){

            isDuplicateVote = true;
            break;

            }
            
        }

        require(!isDuplicateVote, "Caller has already voted");
        airlineVotes[airline].push(msg.sender);
        airlines[airline].votes++;
    }

    /**
     * @dev Add an airline to the registration queue
     *      Can only be called from FlightSuretyApp contract
     *
     */
    function registerAirline(address airlineAddress, string calldata airlineName)
        external
        requireNotRegistred(airlineAddress)
        returns (bool)
    {
        if (airlinesCount >= MIN_AIRLINE_LIMIT) {
            uint256 consensusNumber = airlinesCount.div(2);
            //add airline but as unregistered so that votes can be submitted
            if (!airlines[airlineAddress].isAdded) {
                airlines[airlineAddress] = Airline({
                    airline: airlineAddress,
                    isRegistered: false,
                    isAdded: true,
                    name: airlineName,
                    funds: 0,
                    votes: 0
                });
            }
            
                if(airlines[airlineAddress].votes >= consensusNumber){
                    airlines[airlineAddress].isRegistered = true;
                    airlinesCount++;
                }
               
            
        } else {
            airlines[airlineAddress] = Airline({
                airline: airlineAddress,
                isRegistered: true,
                isAdded: true,
                name: airlineName,
                funds: 0,
                votes: 0
            });
             airlinesCount++;
        }
       
        return(airlines[airlineAddress].isRegistered);
    }

    /**
     * @dev Buy insurance for a flight
     *
     */
    function buy(string calldata flightCode) external payable requireIsOperational {
        if (!passengers[msg.sender].isExisting) {
            passengers[msg.sender] = Passenger({
                isExisting: true,
                passengerWallet: msg.sender,
                credit: 0
            });

            passengerAddresses.push(msg.sender);
        }
        require(
            passengers[msg.sender].insuredFlights[flightCode] == 0,
            "This flight is already insured"
        );
        passengers[msg.sender].insuredFlights[flightCode] = msg.value;
        if (msg.value > MAX_INSURANCE_AMT_LIMIT) {
            msg.sender.transfer(msg.value.sub(MAX_INSURANCE_AMT_LIMIT));
        }
    }

    /**
     *  @dev Credits payouts to insurees
     */
    function creditInsurees(string calldata flightCode) external requireIsOperational {
        for (uint256 i = 0; i < passengerAddresses.length; i++) {
            if (
                passengers[passengerAddresses[i]].insuredFlights[flightCode] !=
                0
            ) {
                uint256 payablePrice = passengers[passengerAddresses[i]]
                    .insuredFlights[flightCode];
                uint256 balance = passengers[passengerAddresses[i]].credit;
                passengers[passengerAddresses[i]].insuredFlights[
                    flightCode
                ] = 0;
                passengers[passengerAddresses[i]].credit =
                    balance +
                    payablePrice +
                    payablePrice.div(2);
            }
        }
    }

    /**
     *  @dev Transfers eligible payout funds to insuree
     *
     */
    function pay(address  passenger)
        external
        payable
        requireInsuredPassenger(passenger)
        requireIsOperational
    {
        require(
            passengers[passenger].credit > 0,
            "There is not credit pending to be withdrawn for the passenger"
        );
        uint256 credit = passengers[passenger].credit;
        require(
            address(this).balance > credit,
            "The contract does not have enough funds to pay the credit"
        );
        passengers[passenger].credit = 0;
        address(uint160(passenger)).transfer(credit);
    }

    /**
     * @dev Initial funding for the insurance. Unless there are too many delayed flights
     *      resulting in insurance payouts, the contract should be self-sustaining
     *
     */
    function fund() public payable requireIsOperational {
        uint256 currentFunds = airlines[msg.sender].funds;
        airlines[msg.sender].funds = currentFunds.add(msg.value);
        totalFunds = totalFunds.add(msg.value);
    }

    /**
     *  @dev withdrawl to insuree
     *
     */
    function withdraw(address passenger)
        public
        payable
        requireIsOperational
        requireInsuredPassenger(passenger)
    {
        require(passenger == tx.origin, "Contracts not allowed");
        require(passengers[passenger].credit > 0, "No amount to be withdrawn");
        uint256 initialBalance = address(this).balance;
        uint256 credit = passengers[passenger].credit;
        require(
            address(this).balance > credit,
            "The contract does not have enough funds to pay the credit"
        );
        passengers[passenger].credit = 0;
        address(uint160(passenger)).transfer(credit);
    }

    function getFlightKey(
        address airline,
        string memory flight,
        uint256 timestamp
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(airline, flight, timestamp));
    }

     function authorizeCaller
                            (
                                address contractAddress
                            )
                            external
                            requireContractOwner
    {
        authorizedContracts[contractAddress] = 1;
    }

     function isAuthorized
                            (
                                address contractAddress
                            )
                            external
                            view
                            returns(bool)
    {
        return(authorizedContracts[contractAddress] == 1);
    }
    /**
     * @dev Fallback function for funding smart contract.
     *
     */
    // function() external payable {
    //     fund();
    // }
}
